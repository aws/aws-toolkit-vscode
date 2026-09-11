/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import { CloseAction, ErrorAction } from 'vscode-languageclient/node'
import { LspServerLifecycleController, LspServerLifecycleConfig } from '../../../shared/lsp/lspServerLifecycle'

/**
 * Mirrors the JetBrains `LspServerLifecycleControllerTest` cases that apply to VS Code, where
 * `startProcess` spans the `initialize` handshake.
 */
describe('LspServerLifecycleController', function () {
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    function createController(overrides?: Partial<LspServerLifecycleConfig<string, string>>) {
        const config: LspServerLifecycleConfig<string, string> = {
            name: 'test-lsp',
            resolveServer: sandbox.stub().resolves('/server.js'),
            startProcess: sandbox.stub().resolves('client'),
            invalidateAndReinstall: sandbox.stub().resolves(),
            ...overrides,
        }
        return { controller: new LspServerLifecycleController<string, string>(config), config }
    }

    function failThenSucceed(failures: number) {
        let calls = 0
        return sandbox.stub().callsFake(async () => {
            calls++
            if (calls <= failures) {
                throw new Error(`start failed #${calls}`)
            }
            return 'client'
        })
    }

    describe('launchWithRetry', function () {
        it('succeeds on first try without invalidating', async function () {
            const { controller, config } = createController()

            assert.strictEqual(await controller.launchWithRetry(), 'client')

            assert.strictEqual((config.invalidateAndReinstall as sinon.SinonStub).callCount, 0)
            assert.strictEqual((config.startProcess as sinon.SinonStub).callCount, 1)
        })

        it('passes the resolved server to startProcess and re-resolves before the retry', async function () {
            const order: string[] = []
            let resolves = 0
            const resolveServer = sandbox.stub().callsFake(async () => {
                order.push('resolve')
                return `/v${++resolves}/server.js`
            })
            let starts = 0
            const startProcess = sandbox.stub().callsFake(async (server: string) => {
                order.push(`start:${server}`)
                if (++starts === 1) {
                    throw new Error('start failed')
                }
                return 'client'
            })
            const invalidateAndReinstall = sandbox.stub().callsFake(async () => {
                order.push('invalidate')
            })
            const { controller } = createController({ resolveServer, startProcess, invalidateAndReinstall })

            await controller.launchWithRetry()

            assert.deepStrictEqual(order, [
                'resolve',
                'start:/v1/server.js',
                'invalidate',
                'resolve',
                'start:/v2/server.js',
            ])
        })

        it('retries exactly once on a process-start failure, invalidating in between', async function () {
            const startProcess = failThenSucceed(1)
            const { controller, config } = createController({ startProcess })

            assert.strictEqual(await controller.launchWithRetry(), 'client')

            assert.strictEqual(startProcess.callCount, 2)
            assert.strictEqual((config.invalidateAndReinstall as sinon.SinonStub).callCount, 1)
        })

        it('does not retry more than once and reports LspStartFailed with the cause', async function () {
            const startProcess = failThenSucceed(5)
            const { controller, config } = createController({ startProcess })

            await assert.rejects(controller.launchWithRetry(), (err: any) => {
                assert.strictEqual(err.code, 'LspStartFailed')
                assert.match(err.message, /failed to start language server after retry/)
                assert.match(err.cause?.message, /start failed #2/)
                return true
            })
            assert.strictEqual(startProcess.callCount, 2)
            assert.strictEqual((config.invalidateAndReinstall as sinon.SinonStub).callCount, 1)
        })

        it('never repairs a resolution/installation failure', async function () {
            const resolveServer = sandbox.stub().rejects(new Error('manifest fetch failed'))
            const { controller, config } = createController({ resolveServer })

            await assert.rejects(controller.launchWithRetry(), /manifest fetch failed/)

            assert.strictEqual((config.invalidateAndReinstall as sinon.SinonStub).callCount, 0)
            assert.strictEqual((config.startProcess as sinon.SinonStub).callCount, 0)
        })

        it('propagates a resolution failure on the retry without wrapping it', async function () {
            const resolveServer = sandbox
                .stub()
                .onFirstCall()
                .resolves('/server.js')
                .onSecondCall()
                .rejects(new Error('reinstall failed'))
            const { controller } = createController({ resolveServer, startProcess: failThenSucceed(1) })

            await assert.rejects(controller.launchWithRetry(), (err: any) => {
                assert.strictEqual(err.message, 'reinstall failed')
                assert.strictEqual(err.code, undefined)
                return true
            })
        })

        it('does not repair a failure rejected by shouldRepair', async function () {
            const rejected = new Error('bad configured path')
            const startProcess = sandbox.stub().rejects(rejected)
            const { controller, config } = createController({
                startProcess,
                shouldRepair: (err) => err !== rejected,
            })

            await assert.rejects(controller.launchWithRetry(), (err) => err === rejected)

            assert.strictEqual((config.invalidateAndReinstall as sinon.SinonStub).callCount, 0)
            assert.strictEqual(startProcess.callCount, 1)
        })

        it('repairs a failure accepted by shouldRepair', async function () {
            const { controller, config } = createController({
                startProcess: failThenSucceed(1),
                shouldRepair: () => true,
            })

            assert.strictEqual(await controller.launchWithRetry(), 'client')
            assert.strictEqual((config.invalidateAndReinstall as sinon.SinonStub).callCount, 1)
        })

        it('runs the beforeAttempt guard before each attempt and aborts when it throws', async function () {
            const startProcess = failThenSucceed(1)
            const { controller, config } = createController({ startProcess })
            let guardCalls = 0
            const guard = () => {
                guardCalls++
                if (guardCalls === 2) {
                    throw new Error('disposed')
                }
            }

            await assert.rejects(controller.launchWithRetry(guard), /disposed/)

            assert.strictEqual(guardCalls, 2)
            assert.strictEqual(startProcess.callCount, 1, 'the retry must not start once the guard aborts')
            assert.strictEqual((config.resolveServer as sinon.SinonStub).callCount, 1)
        })

        it('resets initialized before starting', async function () {
            const { controller } = createController()
            await controller.launchWithRetry()
            controller.onInitialized()
            assert.strictEqual(controller.isInitialized(), true)

            const pending = controller.launchWithRetry()
            assert.strictEqual(controller.isInitialized(), false)
            await pending
        })
    })

    describe('onServerStopped', function () {
        it('normal stop resets the initialized flag without notifying', function () {
            const onServerStopped = sandbox.stub()
            const { controller } = createController({ onServerStopped })
            controller.onInitialized()

            controller.onServerStopped(true)

            assert.strictEqual(controller.isInitialized(), false)
            assert.strictEqual(onServerStopped.callCount, 0)
        })

        it('unexpected stop after initialization notifies and does not reinstall', function () {
            const onServerStopped = sandbox.stub()
            const { controller, config } = createController({ onServerStopped })
            controller.onInitialized()

            controller.onServerStopped(false)

            assert.ok(onServerStopped.calledOnce)
            assert.strictEqual(controller.isInitialized(), false)
            assert.strictEqual((config.invalidateAndReinstall as sinon.SinonStub).callCount, 0)
        })

        it('unexpected stop before initialization is left to the pending launch (no notify, no reinstall)', function () {
            const onServerStopped = sandbox.stub()
            const { controller, config } = createController({ onServerStopped })

            controller.onServerStopped(false)

            assert.strictEqual(onServerStopped.callCount, 0)
            assert.strictEqual((config.invalidateAndReinstall as sinon.SinonStub).callCount, 0)
        })
    })

    describe('createErrorHandler', function () {
        it('continues on error and forwards to onError', async function () {
            const onError = sandbox.stub()
            const { controller } = createController({ onError })
            const err = new Error('boom')

            const result = await controller.createErrorHandler().error(err, undefined, 3)

            assert.strictEqual(result.action, ErrorAction.Continue)
            assert.ok(onError.calledOnceWith(err, undefined, 3))
        })

        it('does not auto-restart on close and routes the close through onServerStopped', async function () {
            const onServerStopped = sandbox.stub()
            const { controller } = createController({ onServerStopped })
            controller.onInitialized()

            const result = await controller.createErrorHandler().closed()

            assert.strictEqual(result.action, CloseAction.DoNotRestart)
            assert.ok(onServerStopped.calledOnce)
        })
    })

    it('full lifecycle: launch, initialize, post-init crash does not reinstall, relaunch repairs a start failure', async function () {
        const startProcess = sandbox
            .stub()
            .onCall(0)
            .resolves('client-1')
            .onCall(1)
            .rejects(new Error('spawn failed'))
            .onCall(2)
            .resolves('client-2')
        const { controller, config } = createController({ startProcess })

        assert.strictEqual(await controller.launchWithRetry(), 'client-1')
        controller.onInitialized()
        controller.onServerStopped(false)
        assert.strictEqual((config.invalidateAndReinstall as sinon.SinonStub).callCount, 0)

        assert.strictEqual(await controller.launchWithRetry(), 'client-2')
        assert.strictEqual((config.invalidateAndReinstall as sinon.SinonStub).callCount, 1)
    })
})
