/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import {
    LspLauncher,
    LspLauncherConfig,
    LspInstallationInvalidator,
    LspServerResolver,
} from '../../../shared/lsp/lspLauncher'
import { LanguageClient } from 'vscode-languageclient/node'

describe('LspLauncher', function () {
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    function createMockClient(shouldFailStart = false): LanguageClient {
        const client = {
            start: shouldFailStart ? sandbox.stub().rejects(new Error('start failed')) : sandbox.stub().resolves(),
            stop: sandbox.stub().resolves(),
            dispose: sandbox.stub().resolves(),
        } as unknown as LanguageClient
        return client
    }

    function createConfig(overrides?: Partial<LspLauncherConfig>): LspLauncherConfig {
        const invalidateSpy = sandbox.stub()
        const resolver: LspServerResolver = {
            serverExecutable: sandbox.stub().resolves('/path/to/server.js'),
            serverRootDir: sandbox.stub().resolves('/path/to'),
        }
        const invalidator: LspInstallationInvalidator = {
            invalidateResolvedInstallation: invalidateSpy,
        }

        return {
            name: 'test-lsp',
            resolver,
            invalidator,
            clientFactory: sandbox.stub().resolves(createMockClient()),
            ...overrides,
        }
    }

    describe('start', function () {
        it('starts client successfully on first attempt', async function () {
            const config = createConfig()
            const launcher = new LspLauncher(config)

            const client = await launcher.start()

            assert.ok(client)
            assert.ok((client.start as sinon.SinonStub).calledOnce)
        })

        it('calls clientFactory with server path and root dir', async function () {
            const config = createConfig()
            const launcher = new LspLauncher(config)

            await launcher.start()

            assert.ok((config.clientFactory as sinon.SinonStub).calledWith('/path/to/server.js', '/path/to'))
        })

        it('calls onStarted hook after successful start', async function () {
            const onStarted = sandbox.stub().resolves()
            const config = createConfig({ onStarted })
            const launcher = new LspLauncher(config)

            await launcher.start()

            assert.ok(onStarted.calledOnce)
        })

        it('returns existing running client on later start calls', async function () {
            const config = createConfig()
            const launcher = new LspLauncher(config)

            const client1 = await launcher.start()
            const client2 = await launcher.start()

            assert.strictEqual(client1, client2)
            // clientFactory should only be called once
            assert.strictEqual((config.clientFactory as sinon.SinonStub).callCount, 1)
        })
    })

    describe('disposed guard', function () {
        it('throws when starting a disposed launcher', async function () {
            const config = createConfig()
            const launcher = new LspLauncher(config)

            launcher.dispose()

            await assert.rejects(launcher.start(), /cannot start a disposed launcher/)
        })
    })

    describe('retry on failure', function () {
        /**
         * Creates a clientFactory that fails for the first N calls then succeeds.
         * Returns the factory stub and a callCount accessor.
         */
        function failingThenSucceedingFactory(failCount: number) {
            let callCount = 0
            const factory = sandbox.stub().callsFake(async () => {
                callCount++
                if (callCount <= failCount) {
                    return createMockClient(true)
                }
                return createMockClient(false)
            })
            return { factory, getCallCount: () => callCount }
        }

        it('retries exactly once after first start failure', async function () {
            const { factory, getCallCount } = failingThenSucceedingFactory(1)
            const config = createConfig({ clientFactory: factory })
            const launcher = new LspLauncher(config)

            const client = await launcher.start()

            assert.ok(client)
            assert.strictEqual(getCallCount(), 2)
        })

        it('invalidates installation before retry', async function () {
            const { factory } = failingThenSucceedingFactory(1)
            const config = createConfig({ clientFactory: factory })
            const launcher = new LspLauncher(config)

            await launcher.start()

            assert.ok((config.invalidator.invalidateResolvedInstallation as sinon.SinonStub).calledOnce)
        })

        it('best-effort stops the failed candidate client', async function () {
            const failingClient = createMockClient(true)
            let callCount = 0
            const clientFactory = sandbox.stub().callsFake(async () => {
                callCount++
                if (callCount === 1) {
                    return failingClient
                }
                return createMockClient(false)
            })

            const config = createConfig({ clientFactory })
            const launcher = new LspLauncher(config)

            await launcher.start()

            assert.ok((failingClient.stop as sinon.SinonStub).calledOnce)
            assert.ok((failingClient.dispose as sinon.SinonStub).calledOnce)
        })

        it('throws after retry also fails', async function () {
            const clientFactory = sandbox.stub().callsFake(async () => createMockClient(true))

            const config = createConfig({ clientFactory })
            const launcher = new LspLauncher(config)

            await assert.rejects(launcher.start(), /failed to start language server after retry/)
        })

        it('calls invalidate exactly once even when retry fails', async function () {
            const clientFactory = sandbox.stub().callsFake(async () => createMockClient(true))

            const config = createConfig({ clientFactory })
            const launcher = new LspLauncher(config)

            try {
                await launcher.start()
            } catch {
                // expected
            }

            assert.strictEqual((config.invalidator.invalidateResolvedInstallation as sinon.SinonStub).callCount, 1)
        })
    })

    describe('onStarted failure cleanup', function () {
        it('cleans up started client when onStarted hook fails', async function () {
            const client = createMockClient(false)
            const clientFactory = sandbox.stub().resolves(client)
            const onStarted = sandbox.stub().rejects(new Error('onStarted hook exploded'))

            const config = createConfig({ clientFactory, onStarted })
            const launcher = new LspLauncher(config)

            // First attempt fails due to onStarted, then retry should succeed
            const retryClient = createMockClient(false)
            ;(config.clientFactory as sinon.SinonStub)
                .onFirstCall()
                .resolves(client)
                .onSecondCall()
                .resolves(retryClient)
            ;(config.onStarted as sinon.SinonStub)
                .onFirstCall()
                .rejects(new Error('hook failed'))
                .onSecondCall()
                .resolves()

            const result = await launcher.start()

            assert.ok((client.stop as sinon.SinonStub).calledOnce)
            assert.ok((client.dispose as sinon.SinonStub).calledOnce)
            assert.strictEqual(result, retryClient)
        })

        it('does not leak partial state when onStarted fails and retry also fails', async function () {
            const client = createMockClient(false)
            const onStarted = sandbox.stub().rejects(new Error('hook always fails'))
            const clientFactory = sandbox.stub().resolves(client)

            const config = createConfig({ clientFactory, onStarted })
            const launcher = new LspLauncher(config)

            try {
                await launcher.start()
            } catch {
                // expected
            }

            // Client should have no residual state
            assert.strictEqual(launcher.getClient(), undefined)
        })
    })

    describe('deduplication', function () {
        it('deduplicates concurrent start calls', async function () {
            let resolveStart: () => void
            const startPromise = new Promise<void>((resolve) => {
                resolveStart = resolve
            })

            const client = {
                start: sandbox.stub().callsFake(async () => {
                    await startPromise
                }),
                stop: sandbox.stub().resolves(),
            } as unknown as LanguageClient

            const clientFactory = sandbox.stub().resolves(client)
            const config = createConfig({ clientFactory })
            const launcher = new LspLauncher(config)

            // Start two concurrent calls
            const promise1 = launcher.start()
            const promise2 = launcher.start()

            // Resolve the pending start
            resolveStart!()

            const [result1, result2] = await Promise.all([promise1, promise2])

            // Both should get the same client
            assert.strictEqual(result1, result2)
            // Factory should only be called once
            assert.strictEqual(clientFactory.callCount, 1)
        })

        it('allows new start after previous completes and is stopped', async function () {
            const config = createConfig()
            const launcher = new LspLauncher(config)

            await launcher.start()
            await launcher.stop()

            // Start again — should work
            const client = await launcher.start()
            assert.ok(client)
            assert.strictEqual((config.clientFactory as sinon.SinonStub).callCount, 2)
        })
    })

    describe('stop and dispose', function () {
        it('stops the client', async function () {
            const config = createConfig()
            const launcher = new LspLauncher(config)

            const client = await launcher.start()
            await launcher.stop()

            assert.ok((client.stop as sinon.SinonStub).calledOnce)
            assert.ok((client.dispose as sinon.SinonStub).calledOnce)
            assert.strictEqual(launcher.getClient(), undefined)
        })

        it('dispose stops the client and marks as disposed', async function () {
            const config = createConfig()
            const launcher = new LspLauncher(config)

            await launcher.start()
            launcher.dispose()

            // dispose is fire-and-forget; just ensure no errors
            // And subsequent start should throw
            await assert.rejects(launcher.start(), /cannot start a disposed launcher/)
        })
    })
})
