/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { ToolkitError } from '../../../shared/errors'
import { asStringifiedStack, FunctionEntry, TelemetrySpan, TelemetryTracer } from '../../../shared/telemetry/spans'
import { MetricName, MetricShapes, telemetry } from '../../../shared/telemetry/telemetry'
import { assertTelemetry, getMetrics, installFakeClock } from '../../testUtil'
import { selectFrom } from '../../../shared/utilities/tsUtils'
import { getAwsServiceError } from '../errors.test'
import { sleep } from '../../../shared'
import { withTelemetryContext } from '../../../shared/telemetry/util'
import { SinonSandbox } from 'sinon'
import sinon from 'sinon'
import { stubPerformance } from '../../utilities/performance'
import * as crypto from '../../../shared/crypto'

describe('TelemetrySpan', function () {
    let clock: ReturnType<typeof installFakeClock>
    let sandbox: SinonSandbox

    beforeEach(function () {
        clock = installFakeClock()
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        clock.uninstall()
        sandbox.restore()
    })

    it('removes passive and value from the metadata', function () {
        new TelemetrySpan('foo').emit({ passive: false, value: 100, result: 'Succeeded', reason: 'bar' })

        assertTelemetry('foo' as MetricName, { result: 'Succeeded', reason: 'bar' })
    })

    it('records duration if a start time is available', function () {
        const span = new TelemetrySpan('foo').start()
        clock.tick(100)
        span.stop()

        assertTelemetry('foo' as MetricName, {
            result: 'Succeeded',
            duration: 100,
        })
    })

    it('records failure reason if available', function () {
        new TelemetrySpan('foo').start().stop(new ToolkitError('', { code: 'Foo' }))

        assertTelemetry('foo' as MetricName, {
            result: 'Failed',
            reason: 'Foo',
            duration: 0,
        })
    })

    it('reports missing required fields', function () {
        new TelemetrySpan('vscode_executeCommand').emit()

        assertTelemetry('vscode_executeCommand', {
            missingFields: String(['command']),
        } as any)
    })

    it('can create clones that do not copy the start time', function () {
        const span = new TelemetrySpan('foo').record({ reason: 'bar' }).start()
        clock.tick(100)
        span.clone().emit({ result: 'Failed' })
        span.stop()

        assertTelemetry('foo' as MetricName, [
            { result: 'Failed', reason: 'bar' },
            { result: 'Succeeded', duration: 100 },
        ])
    })

    it('records performance', function () {
        const { expectedUserCpuUsage, expectedSystemCpuUsage, expectedHeapTotal } = stubPerformance(sandbox)
        const span = new TelemetrySpan('function_call', {
            emit: true,
        })
        span.start()
        clock.tick(90)
        span.stop()
        assertTelemetry('function_call', {
            userCpuUsage: expectedUserCpuUsage,
            systemCpuUsage: expectedSystemCpuUsage,
            heapTotal: expectedHeapTotal,
            duration: 90,
            result: 'Succeeded',
        })
    })
})

describe('TelemetryTracer', function () {
    let tracer: TelemetryTracer
    let clock: ReturnType<typeof installFakeClock> | undefined
    let sandbox: SinonSandbox
    const metricName = 'test_metric' as MetricName

    beforeEach(function () {
        tracer = new TelemetryTracer()
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        clock?.uninstall()
        sandbox.restore()
    })

    describe('record()', function () {
        it('only writes to the active span in the current context', function () {
            tracer.apigateway_copyUrl.run(() => {
                tracer.run(metricName, () => tracer.record({ source: 'bar' }))
                tracer.spans[0]?.emit()
            })

            assertTelemetry(metricName, { result: 'Succeeded', source: 'bar' })
            assertTelemetry('apigateway_copyUrl', {} as MetricShapes['apigateway_copyUrl'])
        })

        it('writes to all new spans in the current context', function () {
            tracer.apigateway_copyUrl.run(() => {
                tracer.record({ source: 'bar' })
                tracer.run(metricName, () => {})
            })

            assertTelemetry(metricName, { result: 'Succeeded', source: 'bar' })
            assertTelemetry('apigateway_copyUrl', { result: 'Succeeded', source: 'bar' } as any)
        })

        it('does not propagate state outside of the execution', function () {
            tracer.apigateway_copyUrl.run(() => tracer.record({ source: 'bar' }))
            tracer.run(metricName, () => {})

            assertTelemetry(metricName, { result: 'Succeeded' })
        })

        it('does not clobber subsequent writes to individual spans', function () {
            tracer.run(metricName, (span) => {
                tracer.record({ source: 'bar' })
                span.record({ source: 'foo' })
            })

            assertTelemetry(metricName, { result: 'Succeeded', source: 'foo' })
        })

        it('has no effect when called outside of a context', function () {
            tracer.record({ source: 'bar' })
            tracer.run(metricName, () => {})

            assertTelemetry(metricName, { result: 'Succeeded' })
        })
    })

    describe('instrument()', function () {
        async function assertPositive(n: number): Promise<number> {
            if (n <= 0) {
                throw new Error()
            }

            return n
        }

        it('can instrument a function', async function () {
            const fn = tracer.instrument(metricName, assertPositive)

            assert.strictEqual(await fn(1), 1)
            assertTelemetry(metricName, { result: 'Succeeded' })
        })

        it('can instrument a function that fails', async function () {
            const fn = tracer.instrument(metricName, assertPositive)

            await assert.rejects(() => fn(-1))
            assertTelemetry(metricName, { result: 'Failed', reason: 'Error' })
        })
    })

    describe('metrics', function () {
        it('does not change the context when emitting', function () {
            tracer.vscode_executeCommand.emit({ command: 'foo', debounceCount: 1 })

            assert.strictEqual(tracer.activeSpan, undefined)
            assert.strictEqual(tracer.spans.length, 0)
        })

        it('does not change the active span when using a different span', function () {
            tracer.run(metricName, (span) => {
                tracer.vscode_executeCommand.record({ command: 'foo', debounceCount: 1 })
                assert.strictEqual(tracer.activeSpan, span)
            })

            assertTelemetry(metricName, { result: 'Succeeded' })
            assert.strictEqual(tracer.activeSpan, undefined)
        })
    })

    describe('increment()', function () {
        it('starts at 0 for uninitialized fields', function () {
            tracer.vscode_executeCommand.run((span) => {
                span.record({ command: 'foo' })
                span.increment({ debounceCount: 1 })
                span.increment({ debounceCount: 1 })
            })

            assertTelemetry('vscode_executeCommand', {
                result: 'Succeeded',
                command: 'foo',
                debounceCount: 2,
            })
        })

        it('applies to spans independently from one another', function () {
            tracer.vscode_executeCommand.run((span) => {
                span.record({ debounceCount: 1 })
                span.increment({ debounceCount: 1 })
                tracer.vscode_executeCommand.run((span) => {
                    span.increment({ debounceCount: 10 })
                })
            })

            const metrics = getMetrics('vscode_executeCommand').map((m) => selectFrom(m, 'debounceCount'))
            assert.deepStrictEqual(metrics[0], { debounceCount: '10' })
            assert.deepStrictEqual(metrics[1], { debounceCount: '2' })
        })
    })

    describe('run()', function () {
        it('returns the result of the function', function () {
            const result = tracer.run(metricName, () => 'foo')

            assert.strictEqual(result, 'foo')
        })

        it('sets the active span', function () {
            const checkSpan = () => tracer.run(metricName, (span) => assert.strictEqual(tracer.activeSpan, span))

            assert.doesNotThrow(checkSpan)
        })

        it('uses a span over a telemetry metric', function () {
            tracer.run(metricName, (span) => span.record({ source: 'bar' }))

            assertTelemetry(metricName, { result: 'Succeeded', source: 'bar' })
        })

        it('records standard fields on failed service request', async function () {
            await assert.rejects(async () => {
                await tracer.aws_loginWithBrowser.run(async () => {
                    throw await getAwsServiceError()
                })
            })

            assertTelemetry('aws_loginWithBrowser', {
                result: 'Failed',
                reason: 'InvalidRequestException',
                reasonDesc: 'InvalidRequestException: Invalid client ID provided',
                httpStatusCode: '400',
            })
            const metric = getMetrics('aws_loginWithBrowser')[0]
            assert.match(metric.awsAccount ?? '', /not-set|n\/a|\d+/)
            assert.match(metric.awsRegion ?? '', /not-set|\w+-\w+-\d+/)
            assert.match(String(metric.duration) ?? '', /\d+/)
            assert.match(metric.requestId ?? '', /[a-z0-9-]+/)
        })

        it('records performance', function () {
            clock = installFakeClock()
            const { expectedUserCpuUsage, expectedSystemCpuUsage, expectedHeapTotal } = stubPerformance(sandbox)
            tracer.run(
                'function_call',
                () => {
                    clock?.tick(90)
                },
                {
                    emit: true,
                }
            )

            assertTelemetry('function_call', {
                userCpuUsage: expectedUserCpuUsage,
                systemCpuUsage: expectedSystemCpuUsage,
                heapTotal: expectedHeapTotal,
                duration: 90,
                result: 'Succeeded',
            })
        })

        describe('nested run()', function () {
            let uuidStub: sinon.SinonStub
            const nestedName = 'nested_metric' as MetricName
            const testId = 'foo-foo-foo-foo-foo'
            const flowName = 'testTraceFlow'

            beforeEach(() => {
                uuidStub = sandbox.stub(crypto, 'randomUUID')

                // in the first call we set the trace id in subsequent calls we get the span ids
                uuidStub.returns(testId)
            })

            it('can record metadata in nested spans', function () {
                tracer.run(metricName, (span1) => {
                    span1.record({ source: 'bar' })

                    tracer.run(nestedName, (span2) => {
                        span1.record({ attempts: 1 })
                        span2.record({ source: 'foo' })
                    })
                })

                assertTelemetry(metricName, { result: 'Succeeded', source: 'bar', attempts: 1 })
                assertTelemetry(nestedName, { result: 'Succeeded', source: 'foo' })
            })

            it('removes spans when exiting an execution context', function () {
                tracer.run(metricName, () => {
                    tracer.run(nestedName, () => {
                        assert.strictEqual(tracer.spans.length, 3)
                    })

                    assert.strictEqual(tracer.spans.length, 2)
                })
            })

            it('adds spans during a nested execution, closing them when after', function () {
                tracer.run(metricName, () => {
                    tracer.run(nestedName, () => assert.strictEqual(tracer.spans.length, 3))
                    tracer.run(nestedName, () => assert.strictEqual(tracer.spans.length, 3))
                    assert.strictEqual(tracer.spans.length, 2)
                })

                assert.strictEqual(tracer.spans.length, 0)
            })

            it('supports nesting the same event name', function () {
                tracer.run(metricName, () => {
                    tracer.run(metricName, () => {
                        assert.strictEqual(tracer.spans.length, 3)
                        assert.ok(tracer.spans.filter((m) => m.name !== 'root').every((s) => s.name === metricName))
                    })
                })
            })

            it('attaches the parent id to the child span', function () {
                tracer.run(metricName, () => tracer.run(nestedName, () => {}))
                assertTelemetry(metricName, { result: 'Succeeded' })
                assertTelemetry(nestedName, { result: 'Succeeded', parentId: testId } as any)
            })

            it('should set trace id', function () {
                telemetry.trace_event.run((span) => {
                    span.record({ name: flowName })
                    assert.deepStrictEqual(telemetry.activeSpan?.getMetricId(), testId)
                })
                const event = getMetrics('trace_event')
                assert.deepStrictEqual(event[0].traceId, testId)
                assert.deepStrictEqual(event[0].name, 'testTraceFlow')
            })

            it('trace id is propogated to children', function () {
                const metricsIds = {
                    trace_event: {
                        metricId: 'traceEvent',
                        traceId: testId,
                        parentId: undefined,
                    },
                    amazonq_startConversation: {
                        metricId: 'amazonq_startConversation',
                        traceId: testId,
                        parentId: 'traceEvent',
                    },
                    amazonq_addMessage: {
                        metricId: 'amazonq_addMessage',
                        traceId: testId,
                        parentId: 'amazonq_startConversation',
                    },
                    vscode_executeCommand: {
                        metricId: 'vscode_executeCommand',
                        traceId: testId,
                        parentId: 'traceEvent',
                    },
                    amazonq_enterFocusConversation: {
                        metricId: 'amazonq_enterFocusConversation',
                        traceId: testId,
                        parentId: 'vscode_executeCommand',
                    },
                    amazonq_exitFocusConversation: {
                        metricId: 'amazonq_exitFocusConversation',
                        traceId: testId,
                        parentId: 'amazonq_enterFocusConversation',
                    },
                    amazonq_closeChat: {
                        metricId: 'amazonq_closeChat',
                        traceId: testId,
                        parentId: 'traceEvent',
                    },
                }

                /**
                 * randomUUID calls:
                 * The first is called on the root event that never gets emitted
                 * The second is called when generating the traceId
                 * The rest are called when generating the spanIds
                 */
                uuidStub.onCall(1).returns(testId)
                let index = 2
                for (const v of Object.values(metricsIds)) {
                    uuidStub.onCall(index).returns(v.metricId)
                    index++
                }

                telemetry.trace_event.run(() => {
                    telemetry.amazonq_startConversation.run(() => {
                        telemetry.amazonq_addMessage.run(() => {})
                    })
                    telemetry.vscode_executeCommand.run(() => {
                        telemetry.amazonq_enterFocusConversation.run(() => {
                            telemetry.amazonq_exitFocusConversation.run(() => {})
                        })
                    })
                    telemetry.amazonq_closeChat.emit({
                        result: 'Succeeded',
                    })
                })

                const spanEntries = Object.entries(metricsIds)
                for (let x = 0; x < spanEntries.length; x++) {
                    const [metricName, { metricId, traceId, parentId }] = spanEntries[x]
                    const metric = getMetrics(metricName as keyof MetricShapes)[0] as any
                    assert.deepStrictEqual(metric.traceId, traceId)
                    assert.deepStrictEqual(metric.metricId, metricId)
                    assert.deepStrictEqual(metric.parentId, parentId)
                }
            })
        })

        describe(`run() with emit false`, function () {
            it('emits by default when not set', function () {
                telemetry.run(metricName, (span) => {
                    span.record({ awsRegion: 'us-east-1' })
                })
                assertTelemetry(metricName, [{ awsRegion: 'us-east-1' }])
            })

            it('emits when set to true', function () {
                telemetry.run(
                    metricName,
                    (span) => {
                        span.record({ awsRegion: 'us-east-1' })
                    },
                    { emit: true }
                )
                assertTelemetry(metricName, [{ awsRegion: 'us-east-1' }])
            })

            it('emits nothing when set to false', function () {
                telemetry.run(
                    metricName,
                    (span) => {
                        span.record({ awsRegion: 'us-east-1' })
                    },
                    { emit: false }
                )
                assertTelemetry(metricName, [])
            })
        })

        describe('run() with function entry', function () {
            /**
             * A class that uses execution context in its methods calls
             */
            class TestClassA1 {
                constructor(readonly a2: TestClassA2) {}

                methodA(): Promise<FunctionEntry[]> {
                    return telemetry.function_call.run(() => this.methodB(), {
                        functionId: { name: 'methodA', class: 'TestClassA1' },
                    })
                }

                /**
                 * IMPORTANT: this does not set a context, so it will not be included. But
                 * any nested calls that set their own execution context will.
                 */
                methodB() {
                    return this.a2.methodX()
                }
            }

            /**
             * Another class that uses execution context in its calls
             */
            class TestClassA2 {
                methodX(): Promise<FunctionEntry[]> {
                    return telemetry.function_call.run(
                        async () => {
                            // sleep to hand over execution to the other class
                            await sleep(100)
                            return this.methodY()
                        },
                        {
                            functionId: { name: 'methodX', class: 'TestClassA2' },
                        }
                    )
                }

                methodY() {
                    return telemetry.function_call.run(() => this.methodZ(), {
                        functionId: { name: 'methodY', class: 'TestClassA2' },
                    })
                }

                methodZ() {
                    return telemetry.function_call.run(() => functionWithExecutionContext(), {
                        functionId: { name: 'thisIsAlsoZ', class: 'TestClassA2' },
                    })
                }
            }

            /**
             * Another class that uses execution context in its calls
             */
            class TestClassB1 {
                @withTelemetryContext({ name: 'methodJ', class: 'TestClassB1' })
                async methodJ(): Promise<FunctionEntry[]> {
                    return this.methodK()
                }

                methodK() {
                    return telemetry.function_call.run(
                        async () => {
                            // sleep to hand over execution to the other class
                            await sleep(100)
                            return this.methodL()
                        },
                        {
                            functionId: { name: 'methodK', class: 'TestClassB1' },
                        }
                    )
                }

                methodL() {
                    return telemetry.accessanalyzer_iamPolicyChecksCustomChecks.run(
                        () => {
                            return functionWithExecutionContext()
                        },
                        {
                            functionId: { name: 'methodL', class: 'TestClassB1' },
                        }
                    )
                }
            }

            function functionWithExecutionContext() {
                return telemetry.function_call.run(() => telemetry.getFunctionStack(), {
                    functionId: { name: 'functionWithExecutionContext' },
                })
            }

            it(`returns the correct call stack when the context switches`, async function () {
                // This test runs multiple functions that use the context asynchronously. They sleep() part way through their entire flow,
                // which allows the other to execute. We expect the async local storage to maintain the correct context for each execution.
                // The final nested function call in each stack returns the final stringified source stack.

                const a1 = new TestClassA1(new TestClassA2())
                const b1 = new TestClassB1()

                const [resA1, resB1] = await Promise.all([a1.methodA(), b1.methodJ()])

                assert.deepStrictEqual(resA1, [
                    { name: 'methodA', class: 'TestClassA1' },
                    { name: 'methodX', class: 'TestClassA2' },
                    { name: 'methodY', class: 'TestClassA2' },
                    { name: 'thisIsAlsoZ', class: 'TestClassA2' },
                    { name: 'functionWithExecutionContext' },
                ])
                assert.deepStrictEqual(
                    asStringifiedStack(resA1),
                    'TestClassA1#methodA:TestClassA2#methodX,methodY,thisIsAlsoZ:functionWithExecutionContext'
                )

                assert.deepStrictEqual(resB1, [
                    { name: 'methodJ', class: 'TestClassB1' },
                    { name: 'methodK', class: 'TestClassB1' },
                    { name: 'methodL', class: 'TestClassB1' },
                    { name: 'functionWithExecutionContext' },
                ])
                assert.deepStrictEqual(
                    asStringifiedStack(resB1),
                    'TestClassB1#methodJ,methodK,methodL:functionWithExecutionContext'
                )
            })

            it(`${asStringifiedStack.name}() works as expected`, function () {
                assert.deepStrictEqual(asStringifiedStack([]), '')
                assert.deepStrictEqual(asStringifiedStack([{ name: 'a' }]), 'a')
                assert.deepStrictEqual(asStringifiedStack([{ name: 'a' }, { name: 'b' }]), 'a:b')
                assert.deepStrictEqual(
                    asStringifiedStack([{ name: 'a' }, { name: 'b' }, { name: 'c', class: 'C' }]),
                    'a:b:C#c'
                )
                assert.deepStrictEqual(
                    asStringifiedStack([
                        { name: 'a1', class: 'A' },
                        { name: 'a2', class: 'A' },
                        { name: 'b1', class: 'B' },
                        { name: 'b2', class: 'B' },
                    ]),
                    'A#a1,a2:B#b1,b2'
                )
            })

            class TestEmit {
                @withTelemetryContext({ name: 'doesNotEmit', class: 'TestEmit' })
                doesNotEmit() {
                    return
                }
            }

            it(`withTelemetryContext does not emit an event on its own`, function () {
                const inst = new TestEmit()
                inst.doesNotEmit()
                assertTelemetry('function_call', [])
            })
        })
    })
})
