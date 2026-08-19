/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import {
    LspServerProvider,
    LspServerProviderI,
} from '../../../../awsService/cloudformation/lsp-server/lspServerProvider'
import { SettingsLspServerProvider } from '../../../../awsService/cloudformation/lsp-server/settingsLspServerProvider'
import * as env from '../../../../shared/vscode/env'
import * as nodeFs from 'fs' // eslint-disable-line no-restricted-imports

describe('LspServerProvider', function () {
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    function createMockProvider(
        name: string,
        canProvide: boolean,
        executable = '/path/to/server.js',
        rootDir = '/path/to',
        shouldFail = false
    ): LspServerProviderI {
        return {
            name: () => name,
            canProvide: () => canProvide,
            serverExecutable: shouldFail
                ? () => Promise.reject(new Error(`${name} failed`))
                : () => Promise.resolve(executable),
            serverRootDir: shouldFail
                ? () => Promise.reject(new Error(`${name} failed`))
                : () => Promise.resolve(rootDir),
        }
    }

    describe('constructor', function () {
        it('throws when no providers can provide', function () {
            assert.throws(
                () => new LspServerProvider([createMockProvider('a', false), createMockProvider('b', false)]),
                /Matched with 0 CloudFormation LSP providers/
            )
        })

        it('filters to only providers that canProvide', function () {
            const provider = new LspServerProvider([createMockProvider('a', false), createMockProvider('b', true)])
            assert.ok(provider)
        })
    })

    describe('evaluateProviders', function () {
        it('resolves from first available provider', async function () {
            const provider = new LspServerProvider([
                createMockProvider('first', true, '/first/server.js', '/first'),
                createMockProvider('second', true, '/second/server.js', '/second'),
            ])

            const exe = await provider.serverExecutable()
            assert.strictEqual(exe, '/first/server.js')
        })

        it('falls through to next provider when first fails', async function () {
            const provider = new LspServerProvider([
                createMockProvider('failing', true, '', '', true),
                createMockProvider('working', true, '/working/server.js', '/working'),
            ])

            const exe = await provider.serverExecutable()
            assert.strictEqual(exe, '/working/server.js')
        })

        it('throws when ALL providers fail', async function () {
            const provider = new LspServerProvider([
                createMockProvider('fail1', true, '', '', true),
                createMockProvider('fail2', true, '', '', true),
            ])

            await assert.rejects(provider.serverExecutable(), /All CloudFormation LSP providers failed.*fail1.*fail2/)
        })

        it('caches successful resolution', async function () {
            const mockProvider = createMockProvider('cached', true, '/cached/server.js', '/cached')
            const execSpy = sandbox.spy(mockProvider, 'serverExecutable')

            const provider = new LspServerProvider([mockProvider])

            await provider.serverExecutable()
            await provider.serverExecutable()

            // serverExecutable on the underlying provider should only be called once
            assert.strictEqual(execSpy.callCount, 1)
        })
    })

    describe('invalidateResolvedInstallation', function () {
        it('clears cache so next call re-evaluates', async function () {
            const mockProvider = createMockProvider('invalidate', true, '/v1/server.js', '/v1')
            const provider = new LspServerProvider([mockProvider])

            await provider.serverExecutable()

            // Invalidate
            await provider.invalidateResolvedInstallation()

            // Change what the underlying provider returns
            sandbox.stub(mockProvider, 'serverExecutable').resolves('/v2/server.js')
            sandbox.stub(mockProvider, 'serverRootDir').resolves('/v2')

            const exe = await provider.serverExecutable()
            assert.strictEqual(exe, '/v2/server.js')
        })

        it('propagates invalidation to providers that implement it', async function () {
            const invalidateSpy = sandbox.stub()
            const mockProvider = {
                name: () => 'with-invalidation',
                canProvide: () => true,
                serverExecutable: () => Promise.resolve('/path/server.js'),
                serverRootDir: () => Promise.resolve('/path'),
                invalidateResolvedInstallation: invalidateSpy,
            }

            const provider = new LspServerProvider([mockProvider])
            await provider.invalidateResolvedInstallation()

            assert.ok(invalidateSpy.calledOnce)
        })
    })
})

describe('SettingsLspServerProvider', function () {
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('canProvide', function () {
        it('returns false when neither debug nor automation', function () {
            sandbox.stub(env, 'isDebugInstance').returns(false)
            sandbox.stub(env, 'isAutomation').returns(false)
            const provider = new SettingsLspServerProvider({ path: '/some/path' })
            assert.strictEqual(provider.canProvide(), false)
        })

        it('returns false when path is undefined (debug=true)', function () {
            sandbox.stub(env, 'isDebugInstance').returns(true)
            sandbox.stub(env, 'isAutomation').returns(false)
            const provider = new SettingsLspServerProvider({})
            assert.strictEqual(provider.canProvide(), false)
        })

        it('returns false when path is undefined (no config)', function () {
            sandbox.stub(env, 'isDebugInstance').returns(true)
            sandbox.stub(env, 'isAutomation').returns(false)
            const provider = new SettingsLspServerProvider()
            assert.strictEqual(provider.canProvide(), false)
        })

        it('returns false when path does not exist on disk', function () {
            sandbox.stub(env, 'isDebugInstance').returns(true)
            sandbox.stub(env, 'isAutomation').returns(false)
            sandbox.stub(nodeFs, 'existsSync').returns(false)
            const provider = new SettingsLspServerProvider({ path: '/nonexistent/path' })
            assert.strictEqual(provider.canProvide(), false)
        })

        it('returns true when isDebugInstance AND path exists', function () {
            sandbox.stub(env, 'isDebugInstance').returns(true)
            sandbox.stub(env, 'isAutomation').returns(false)
            sandbox.stub(nodeFs, 'existsSync').returns(true)
            const provider = new SettingsLspServerProvider({ path: '/valid/path' })
            assert.strictEqual(provider.canProvide(), true)
        })

        it('returns true when isAutomation AND path exists (debug=false)', function () {
            sandbox.stub(env, 'isDebugInstance').returns(false)
            sandbox.stub(env, 'isAutomation').returns(true)
            sandbox.stub(nodeFs, 'existsSync').returns(true)
            const provider = new SettingsLspServerProvider({ path: '/ci/lsp-server' })
            assert.strictEqual(provider.canProvide(), true)
        })

        it('returns false when isAutomation but path missing', function () {
            sandbox.stub(env, 'isDebugInstance').returns(false)
            sandbox.stub(env, 'isAutomation').returns(true)
            const provider = new SettingsLspServerProvider({})
            assert.strictEqual(provider.canProvide(), false)
        })

        it('returns false when isAutomation but path does not exist on disk', function () {
            sandbox.stub(env, 'isDebugInstance').returns(false)
            sandbox.stub(env, 'isAutomation').returns(true)
            sandbox.stub(nodeFs, 'existsSync').returns(false)
            const provider = new SettingsLspServerProvider({ path: '/nonexistent/ci/path' })
            assert.strictEqual(provider.canProvide(), false)
        })
    })

    describe('serverExecutable', function () {
        it('joins path with CfnLspServerFile', async function () {
            sandbox.stub(env, 'isDebugInstance').returns(true)
            sandbox.stub(env, 'isAutomation').returns(false)
            sandbox.stub(nodeFs, 'existsSync').returns(true)
            const provider = new SettingsLspServerProvider({ path: '/my/server' })
            const exe = await provider.serverExecutable()
            assert.ok(exe.startsWith('/my/server/'))
            assert.ok(exe.endsWith('cfn-lsp-server-standalone.js'))
        })

        it('throws when path is not configured', async function () {
            const provider = new SettingsLspServerProvider()
            await assert.rejects(provider.serverExecutable(), /path is not configured/)
        })
    })
})
