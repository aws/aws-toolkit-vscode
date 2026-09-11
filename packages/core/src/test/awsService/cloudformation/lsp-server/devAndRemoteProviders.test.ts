/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import path from 'path'
import * as env from '../../../../shared/vscode/env'
import { fs } from '../../../../shared/fs/fs'
import { DevLspServerProvider } from '../../../../awsService/cloudformation/lsp-server/devLspServerProvider'
import { RemoteLspServerProvider } from '../../../../awsService/cloudformation/lsp-server/remoteLspServerProvider'
import { CfnLspInstaller } from '../../../../awsService/cloudformation/lsp-server/lspInstaller'
import { CfnLspServerFile } from '../../../../awsService/cloudformation/lsp-server/lspServerConfig'
import { ExtensionContext } from 'vscode'
import { useSandbox, useTempTestDir } from '../../../shared/lsp/lspTestFixtures'

describe('DevLspServerProvider', function () {
    const sandbox = useSandbox()
    const tmpDir = useTempTestDir()

    function fakeContext(extensionPath: string): ExtensionContext {
        return { extensionPath } as unknown as ExtensionContext
    }

    /** Extension path is three levels below `root`; the provider scans `root`'s children for a dev bundle. */
    async function createExtensionPath(root: string): Promise<string> {
        const extensionPath = path.join(root, 'aws-toolkit-vscode', 'packages', 'toolkit')
        await fs.mkdir(extensionPath)
        return extensionPath
    }

    async function createDevServer(root: string, siblingName: string): Promise<string> {
        const serverPath = path.join(root, siblingName, 'bundle', 'development', CfnLspServerFile)
        await fs.mkdir(path.dirname(serverPath))
        await fs.writeFile(serverPath, 'server')
        return serverPath
    }

    describe('canProvide', function () {
        it('returns false when not a debug instance, even if a dev server exists', async function () {
            sandbox.stub(env, 'isDebugInstance').returns(false)
            const extensionPath = await createExtensionPath(tmpDir.path)
            await createDevServer(tmpDir.path, 'cfn-lsp')

            const provider = new DevLspServerProvider(fakeContext(extensionPath))
            assert.strictEqual(provider.canProvide(), false)
        })

        it('returns false when debug instance but no server found', async function () {
            sandbox.stub(env, 'isDebugInstance').returns(true)
            const extensionPath = await createExtensionPath(tmpDir.path)
            await fs.mkdir(path.join(tmpDir.path, 'unrelated-sibling'))

            const provider = new DevLspServerProvider(fakeContext(extensionPath))
            assert.strictEqual(provider.canProvide(), false)
        })

        it('returns true when debug instance and server found in sibling directory', async function () {
            sandbox.stub(env, 'isDebugInstance').returns(true)
            const extensionPath = await createExtensionPath(tmpDir.path)
            await createDevServer(tmpDir.path, 'cfn-lsp')

            const provider = new DevLspServerProvider(fakeContext(extensionPath))
            assert.strictEqual(provider.canProvide(), true)
        })
    })

    describe('name', function () {
        it('returns DevLspServerProvider', function () {
            sandbox.stub(env, 'isDebugInstance').returns(false)
            const provider = new DevLspServerProvider(fakeContext(tmpDir.path))
            assert.strictEqual(provider.name(), 'DevLspServerProvider')
        })
    })

    describe('serverExecutable', function () {
        it('returns the discovered dev server path', async function () {
            sandbox.stub(env, 'isDebugInstance').returns(true)
            const extensionPath = await createExtensionPath(tmpDir.path)
            const serverPath = await createDevServer(tmpDir.path, 'cfn-lsp-repo')

            const provider = new DevLspServerProvider(fakeContext(extensionPath))

            assert.ok(provider.canProvide())
            assert.strictEqual(await provider.serverExecutable(), serverPath)
        })
    })

    describe('serverRootDir', function () {
        it('returns dirname of serverExecutable', async function () {
            sandbox.stub(env, 'isDebugInstance').returns(true)
            const extensionPath = await createExtensionPath(tmpDir.path)
            await createDevServer(tmpDir.path, 'lsp-dir')

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

            const provider = new DevLspServerProvider(fakeContext(''))
            assert.strictEqual(provider.canProvide(), false)
        })

        it('returns false for a non-existent extensionPath', function () {
            sandbox.stub(env, 'isDebugInstance').returns(true)

            const provider = new DevLspServerProvider(fakeContext(path.join(tmpDir.path, 'does-not-exist')))
            assert.strictEqual(provider.canProvide(), false)
        })

        it('throws when multiple server locations found', async function () {
            sandbox.stub(env, 'isDebugInstance').returns(true)
            const extensionPath = await createExtensionPath(tmpDir.path)
            await createDevServer(tmpDir.path, 'lsp-a')
            await createDevServer(tmpDir.path, 'lsp-b')

            assert.throws(() => {
                new DevLspServerProvider(fakeContext(extensionPath))
            }, /Found 2 locations/)
        })
    })
})

describe('RemoteLspServerProvider', function () {
    const sandbox = useSandbox()

    function stubInstaller(...lspPaths: string[]) {
        const resolve = sandbox.stub<[], Promise<{ resourcePaths: { lsp: string; node: string } }>>()
        for (const [index, lsp] of lspPaths.entries()) {
            resolve.onCall(index).resolves({ resourcePaths: { lsp, node: '/usr/bin/node' } })
        }
        return {
            resolve,
            cleanupAfterResolveWithLegacy: sandbox.stub().resolves(),
            invalidateResolvedInstallation: sandbox.stub().resolves(),
        }
    }

    function providerWith(installer: ReturnType<typeof stubInstaller>): RemoteLspServerProvider {
        return new RemoteLspServerProvider(() => installer as unknown as CfnLspInstaller)
    }

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
        it('resolves and runs legacy-location cleanup on first call', async function () {
            const installer = stubInstaller('/installed/server.js')

            const result = await providerWith(installer).serverExecutable()

            assert.strictEqual(result, '/installed/server.js')
            assert.ok(installer.resolve.calledOnce)
            assert.ok(installer.cleanupAfterResolveWithLegacy.calledOnce)
        })

        it('caches resolved path on subsequent calls', async function () {
            const installer = stubInstaller('/cached/server.js')
            const provider = providerWith(installer)

            await provider.serverExecutable()
            const result = await provider.serverExecutable()

            assert.strictEqual(result, '/cached/server.js')
            assert.strictEqual(installer.resolve.callCount, 1)
        })

        it('does not construct the installer until a server is requested', async function () {
            const createInstaller = sandbox.stub().returns(stubInstaller('/lazy/server.js'))
            const provider = new RemoteLspServerProvider(createInstaller)

            assert.strictEqual(createInstaller.called, false)
            await provider.serverExecutable()
            assert.ok(createInstaller.calledOnce)
        })

        it('surfaces an installer construction failure from serverExecutable', async function () {
            const provider = new RemoteLspServerProvider(() => {
                throw new Error('LOCALAPPDATA environment variable not set')
            })

            await assert.rejects(provider.serverExecutable(), /LOCALAPPDATA/)
        })
    })

    describe('serverRootDir', function () {
        it('returns dirname of the resolved executable', async function () {
            const rootDir = await providerWith(stubInstaller('/some/dir/server.js')).serverRootDir()
            assert.strictEqual(rootDir, '/some/dir')
        })
    })

    describe('invalidateResolvedInstallation', function () {
        it('clears cached path so next call re-resolves', async function () {
            const installer = stubInstaller('/v1/server.js', '/v2/server.js')
            const provider = providerWith(installer)

            await provider.serverExecutable()
            await provider.invalidateResolvedInstallation()
            const result = await provider.serverExecutable()

            assert.strictEqual(result, '/v2/server.js')
            assert.strictEqual(installer.resolve.callCount, 2)
            assert.ok(installer.invalidateResolvedInstallation.calledOnce)
        })

        it('is a no-op before any server has been resolved', async function () {
            const createInstaller = sandbox.stub().returns(stubInstaller())

            await new RemoteLspServerProvider(createInstaller).invalidateResolvedInstallation()

            assert.strictEqual(createInstaller.called, false)
        })
    })
})
