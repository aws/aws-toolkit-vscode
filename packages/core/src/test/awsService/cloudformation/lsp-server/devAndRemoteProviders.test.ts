/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import sinon from 'sinon'
import path from 'path'
import * as env from '../../../../shared/vscode/env'
import * as nodeFs from 'fs' // eslint-disable-line no-restricted-imports
import { DevLspServerProvider } from '../../../../awsService/cloudformation/lsp-server/devLspServerProvider'
import { RemoteLspServerProvider } from '../../../../awsService/cloudformation/lsp-server/remoteLspServerProvider'
import { CfnLspServerFile } from '../../../../awsService/cloudformation/lsp-server/lspServerConfig'
import { ExtensionContext } from 'vscode'

describe('DevLspServerProvider', function () {
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    function fakeContext(extensionPath: string): ExtensionContext {
        return { extensionPath } as unknown as ExtensionContext
    }

    describe('canProvide', function () {
        it('returns false when not a debug instance', function () {
            sandbox.stub(env, 'isDebugInstance').returns(false)
            sandbox.stub(nodeFs, 'existsSync').returns(true)

            const provider = new DevLspServerProvider(fakeContext('/some/path'))
            assert.strictEqual(provider.canProvide(), false)
        })

        it('returns false when debug instance but no server found', function () {
            sandbox.stub(env, 'isDebugInstance').returns(true)
            sandbox.stub(nodeFs, 'existsSync').returns(false)

            const provider = new DevLspServerProvider(fakeContext('/some/path'))
            assert.strictEqual(provider.canProvide(), false)
        })

        it('returns true when debug instance and server found in sibling directory', function () {
            sandbox.stub(env, 'isDebugInstance').returns(true)
            // existsSync: first for extensionPath validation, then for the server file
            const existsStub = sandbox.stub(nodeFs, 'existsSync')
            existsStub.returns(true)

            // readdirSync: list sibling dirs in the bounded parent
            sandbox
                .stub(nodeFs, 'readdirSync')
                .returns([
                    { name: 'cfn-lsp', isDirectory: () => true, isFile: () => false } as unknown as nodeFs.Dirent,
                ] as unknown as nodeFs.Dirent[])

            const extensionPath = '/workspace/packages/toolkit'
            const provider = new DevLspServerProvider(fakeContext(extensionPath))
            assert.strictEqual(provider.canProvide(), true)
        })
    })

    describe('name', function () {
        it('returns DevLspServerProvider', function () {
            sandbox.stub(env, 'isDebugInstance').returns(false)
            const provider = new DevLspServerProvider(fakeContext('/some/path'))
            assert.strictEqual(provider.name(), 'DevLspServerProvider')
        })
    })

    describe('serverExecutable', function () {
        it('returns path to server when available', async function () {
            sandbox.stub(env, 'isDebugInstance').returns(true)
            const existsStub = sandbox.stub(nodeFs, 'existsSync')
            existsStub.returns(true)

            const parentDir = '/workspace'
            sandbox
                .stub(nodeFs, 'readdirSync')
                .returns([
                    { name: 'cfn-lsp-repo', isDirectory: () => true, isFile: () => false } as unknown as nodeFs.Dirent,
                ] as unknown as nodeFs.Dirent[])

            // extensionPath is 3 levels deep from parentDir
            const extensionPath = path.join(parentDir, 'a', 'b', 'c')
            const provider = new DevLspServerProvider(fakeContext(extensionPath))

            assert.ok(provider.canProvide())
            const result = await provider.serverExecutable()
            assert.ok(result.endsWith(CfnLspServerFile))
            assert.ok(result.includes('bundle'))
            assert.ok(result.includes('development'))
        })
    })

    describe('serverRootDir', function () {
        it('returns dirname of serverExecutable', async function () {
            sandbox.stub(env, 'isDebugInstance').returns(true)
            const existsStub = sandbox.stub(nodeFs, 'existsSync')
            existsStub.returns(true)

            sandbox
                .stub(nodeFs, 'readdirSync')
                .returns([
                    { name: 'lsp-dir', isDirectory: () => true, isFile: () => false } as unknown as nodeFs.Dirent,
                ] as unknown as nodeFs.Dirent[])

            const extensionPath = '/workspace/a/b/c'
            const provider = new DevLspServerProvider(fakeContext(extensionPath))

            assert.ok(provider.canProvide())
            const exe = await provider.serverExecutable()
            const rootDir = await provider.serverRootDir()
            assert.strictEqual(rootDir, path.dirname(exe))
        })
    })

    describe('edge cases', function () {
        it('returns false for empty extensionPath', function () {
            sandbox.stub(env, 'isDebugInstance').returns(true)
            sandbox.stub(nodeFs, 'existsSync').returns(false)

            const provider = new DevLspServerProvider(fakeContext(''))
            assert.strictEqual(provider.canProvide(), false)
        })

        it('throws when multiple server locations found', function () {
            sandbox.stub(env, 'isDebugInstance').returns(true)
            sandbox.stub(nodeFs, 'existsSync').callsFake((candidate) => candidate.toString().length > 0)

            const siblingDirectories = ['lsp-a', 'lsp-b'].map(
                (name) => ({ name, isDirectory: () => true, isFile: () => false }) as unknown as nodeFs.Dirent
            )
            sandbox.stub(nodeFs, 'readdirSync').returns(siblingDirectories as unknown as nodeFs.Dirent[])

            assert.throws(() => {
                new DevLspServerProvider(fakeContext('/workspace/a/b/c'))
            }, /Found 2 locations/)
        })
    })
})

describe('RemoteLspServerProvider', function () {
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('name', function () {
        it('returns RemoteLspServerProvider', function () {
            const provider = new RemoteLspServerProvider()
            assert.strictEqual(provider.name(), 'RemoteLspServerProvider')
        })
    })

    describe('canProvide', function () {
        it('always returns true', function () {
            const provider = new RemoteLspServerProvider()
            assert.strictEqual(provider.canProvide(), true)
        })
    })

    describe('serverExecutable', function () {
        it('resolves via installer on first call', async function () {
            const provider = new RemoteLspServerProvider()
            // Stub the installer's resolve method
            const installerStub = sandbox
                .stub((provider as any).installer, 'resolve')
                .resolves({ resourcePaths: { lsp: '/installed/server.js', node: '/usr/bin/node' } })

            const result = await provider.serverExecutable()
            assert.strictEqual(result, '/installed/server.js')
            assert.ok(installerStub.calledOnce)
        })

        it('caches resolved path on subsequent calls', async function () {
            const provider = new RemoteLspServerProvider()
            const installerStub = sandbox
                .stub((provider as any).installer, 'resolve')
                .resolves({ resourcePaths: { lsp: '/cached/server.js', node: '/usr/bin/node' } })

            await provider.serverExecutable()
            const result = await provider.serverExecutable()

            assert.strictEqual(result, '/cached/server.js')
            assert.strictEqual(installerStub.callCount, 1)
        })
    })

    describe('serverRootDir', function () {
        it('returns dirname of the resolved executable', async function () {
            const provider = new RemoteLspServerProvider()
            sandbox
                .stub((provider as any).installer, 'resolve')
                .resolves({ resourcePaths: { lsp: '/some/dir/server.js', node: '/usr/bin/node' } })

            const rootDir = await provider.serverRootDir()
            assert.strictEqual(rootDir, '/some/dir')
        })
    })

    describe('invalidateResolvedInstallation', function () {
        it('clears cached path so next call re-resolves', async function () {
            const provider = new RemoteLspServerProvider()
            const installerStub = sandbox.stub((provider as any).installer, 'resolve')
            installerStub
                .onFirstCall()
                .resolves({ resourcePaths: { lsp: '/v1/server.js', node: '/usr/bin/node' } })
                .onSecondCall()
                .resolves({ resourcePaths: { lsp: '/v2/server.js', node: '/usr/bin/node' } })

            const installerInvalidateStub = sandbox
                .stub((provider as any).installer, 'invalidateResolvedInstallation')
                .resolves()

            await provider.serverExecutable()
            await provider.invalidateResolvedInstallation()
            const result = await provider.serverExecutable()

            assert.strictEqual(result, '/v2/server.js')
            assert.strictEqual(installerStub.callCount, 2)
            assert.ok(installerInvalidateStub.calledOnce)
        })

        it('propagates to installer invalidateResolvedInstallation', async function () {
            const provider = new RemoteLspServerProvider()
            const installerInvalidateStub = sandbox
                .stub((provider as any).installer, 'invalidateResolvedInstallation')
                .resolves()

            await provider.invalidateResolvedInstallation()
            assert.ok(installerInvalidateStub.calledOnce)
        })
    })
})
