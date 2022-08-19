/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { TelemetryTracer } from '../../../shared/telemetry/spans'
import { MetricName } from '../../../shared/telemetry/telemetry'
import { assertTelemetryCurried } from '../../testUtil'

describe('TelemetryTracer', function () {
    const metricName = 'test_metric' as MetricName
    const assertTelemetry = assertTelemetryCurried(metricName)

    describe('metrics', function () {
        it('creates a span when recording against a metric', function () {
            const tracer = new TelemetryTracer()
            tracer.vscode_executeCommand.record({ command: 'foo', debounceCount: 1 })
            tracer.spans[0]?.emit()

            assertTelemetryCurried('vscode_executeCommand')({ command: 'foo', debounceCount: 1 })
        })
    })

    describe('run', function () {
        it('returns the result of the function', function () {
            const tracer = new TelemetryTracer()
            const result = tracer.run(metricName, () => 'foo')

            assert.strictEqual(result, 'foo')
        })

        it('sets the active span', function () {
            const tracer = new TelemetryTracer()
            const checkSpan = () => tracer.run(metricName, span => assert.strictEqual(tracer.activeSpan, span))

            assert.doesNotThrow(checkSpan)
        })

        it('uses a span over a telemetry metric', function () {
            const tracer = new TelemetryTracer()
            tracer.run(metricName, span => span.record({ source: 'bar' }))

            assertTelemetry({ result: 'Succeeded', source: 'bar' })
        })

        it('can record metadata in nested spans', function () {
            const nestedName = 'nested_metric' as MetricName
            const tracer = new TelemetryTracer()

            tracer.run(metricName, span1 => {
                span1.record({ source: 'bar' })

                tracer.run(nestedName, span2 => {
                    span1.record({ attempts: 1 })
                    span2.record({ source: 'foo' })
                })
            })

            assertTelemetry({ result: 'Succeeded', source: 'bar', attempts: 1 })
            assertTelemetryCurried(nestedName)({ result: 'Succeeded', source: 'foo' })
        })

        it('removes spans when exiting an execution context', function () {
            const nestedName = 'nested_metric' as MetricName
            const tracer = new TelemetryTracer()

            tracer.run(metricName, () => {
                tracer.run(nestedName, () => {
                    assert.strictEqual(tracer.spans.length, 2)
                })

                assert.strictEqual(tracer.spans.length, 1)
            })
        })

        it('adds spans during a nested execution', function () {
            const nestedName = 'nested_metric' as MetricName
            const tracer = new TelemetryTracer()

            tracer.run(metricName, () => {
                tracer.run(nestedName, () => {
                    assert.strictEqual(tracer.spans.length, 2)
                    tracer.apigateway_copyUrl.record({})
                    assert.strictEqual(tracer.spans.length, 3)
                })

                assert.strictEqual(tracer.spans.length, 1)
            })
        })

        it('closes spans after exiting nested executions', function () {
            const nestedName = 'nested_metric' as MetricName
            const tracer = new TelemetryTracer()

            tracer.run(metricName, () => {
                tracer.apigateway_copyUrl.record({})

                tracer.run(nestedName, () => {
                    assert.strictEqual(tracer.spans.length, 3)
                    tracer.apigateway_copyUrl.record({})
                    assert.strictEqual(tracer.spans.length, 3)
                })

                assert.strictEqual(tracer.spans.length, 2)
            })

            assert.strictEqual(tracer.spans.length, 0)
        })
    })
})
