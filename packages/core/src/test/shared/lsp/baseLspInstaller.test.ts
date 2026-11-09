/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as path from 'path'
import sinon from 'sinon'
import { BaseLspInstaller, ResolveManifest } from '../../../shared/lsp/baseLspInstaller'
import { Manifest, ResourcePaths } from '../../../shared/lsp/types'
import { fs } from '../../../shared/fs/fs'
import { TempTestDir, useTempTestDir } from './lspTestFixtures'

/**
 * Concrete test implementation of BaseLspInstaller for testing invalidation.
 */
class TestLspInstaller extends BaseLspInstaller {
    constructor(
        storageDir: string,
        requiredFiles: string[] = [],
        private readonly postInstallAction: (assetDirectory: string) => Promise<void> = async () => {},
        resolveManifest?: ResolveManifest,
        localBundleRoot?: string
    ) {
        super(
            {
                manifestUrl: 'https://example.com/manifest.json',
                supportedVersionRange: '<2.0.0',
                name: 'test-lsp',
                serverFilename: 'server.js',
                suppressPromptPrefix: 'test',
                storageDir,
                requiredFiles,
                localBundleRoot,
            },
            'awsCfnLsp',
            resolveManifest
        )
    }

    protected async postInstall(assetDirectory: string): Promise<void> {
        await this.postInstallAction(assetDirectory)
    }

    runPostInstallForTest(assetDirectory: string): Promise<void> {
        return this.runPostInstall(assetDirectory)
    }

    protected async resourcePaths(assetDirectory: string): Promise<ResourcePaths> {
        return {
            lsp: path.join(assetDirectory, 'server.js'),
            node: process.execPath,
        }
    }

    /**
     * Simulate a resolved installation for testing purposes.
     * Sets the internal resolvedInstallation directly.
     */
    async simulateResolution(assetDir: string, location: 'cache' | 'remote' | 'fallback' | 'override'): Promise<void> {
        // Access private field via casting for testing
        ;(this as any).resolvedInstallation = {
            assetDirectory: assetDir,
            location,
            version: '1.0.0',
            resourcePaths: await this.resourcePaths(assetDir),
        }
    }

    /**
     * Expose installDir for test assertions.
     */
    getTestInstallDir(): string {
        return (this as any).installDir
    }
}

describe('BaseLspInstaller post-install verification', function () {
    const tmpDir = new TempTestDir()

    beforeEach(async function () {
        await tmpDir.setup()
    })

    afterEach(async function () {
        await tmpDir.teardown()
    })

    it('runs postInstall before validating the required file list', async function () {
        const assetDir = path.join(tmpDir.path, '1.0.0')
        await fs.mkdir(path.join(assetDir, 'node_modules'))
        await fs.writeFile(path.join(assetDir, 'server.js'), 'content')
        let hookCalled = false
        const installer = new TestLspInstaller(tmpDir.path, ['node_modules'], async () => {
            hookCalled = true
            await fs.delete(path.join(assetDir, 'node_modules'), { force: true, recursive: true })
        })

        await assert.rejects(
            installer.runPostInstallForTest(assetDir),
            /Required files missing after install.*node_modules/
        )
        assert.strictEqual(hookCalled, true)
    })

    it('validates the server file even when no required files are configured', async function () {
        const assetDir = path.join(tmpDir.path, '1.0.0')
        await fs.mkdir(assetDir)
        await fs.writeFile(path.join(assetDir, 'server.js'), 'content')
        let hookCalled = false
        const installer = new TestLspInstaller(tmpDir.path, [], async () => {
            hookCalled = true
        })

        await assert.doesNotReject(installer.runPostInstallForTest(assetDir))
        assert.strictEqual(hookCalled, true)
    })

    it('fails validation when the server file is missing', async function () {
        const assetDir = path.join(tmpDir.path, '1.0.0')
        await fs.mkdir(assetDir)
        const installer = new TestLspInstaller(tmpDir.path, [])

        await assert.rejects(installer.runPostInstallForTest(assetDir), /Server file "server.js" not found/)
    })
})

describe('BaseLspInstaller.invalidateResolvedInstallation', function () {
    const tmpDir = new TempTestDir()
    let installer: TestLspInstaller

    beforeEach(async function () {
        await tmpDir.setup()
        installer = new TestLspInstaller(tmpDir.path)
    })

    afterEach(async function () {
        await tmpDir.teardown()
    })

    it('clears resolved installation from memory', async function () {
        const installDir = installer.getTestInstallDir()
        const assetDir = path.join(installDir, '1.0.0')
        await fs.mkdir(assetDir)
        await fs.writeFile(path.join(assetDir, 'server.js'), 'content')

        await installer.simulateResolution(assetDir, 'cache')
        assert.ok(installer.getResolvedInstallation())

        await installer.invalidateResolvedInstallation()

        assert.strictEqual(installer.getResolvedInstallation(), undefined)
    })

    it('deletes managed asset directory within installDir', async function () {
        const installDir = installer.getTestInstallDir()
        const assetDir = path.join(installDir, '1.0.0')
        await fs.mkdir(assetDir)
        await fs.writeFile(path.join(assetDir, 'server.js'), 'content')

        await installer.simulateResolution(assetDir, 'cache')

        await installer.invalidateResolvedInstallation()

        // Asset directory should be deleted
        assert.strictEqual(await fs.existsDir(assetDir), false)
    })

    it('does NOT delete override/external installation', async function () {
        const externalDir = path.join(tmpDir.path, 'external-server')
        await fs.mkdir(externalDir)
        await fs.writeFile(path.join(externalDir, 'server.js'), 'content')

        await installer.simulateResolution(externalDir, 'override')

        await installer.invalidateResolvedInstallation()

        // External directory should NOT be deleted
        assert.strictEqual(await fs.existsDir(externalDir), true)
    })

    it('does not delete directories outside installDir', async function () {
        const outsideDir = `${tmpDir.path}-outside`
        await fs.mkdir(outsideDir)
        await fs.writeFile(path.join(outsideDir, 'server.js'), 'content')

        try {
            await installer.simulateResolution(outsideDir, 'remote')
            await installer.invalidateResolvedInstallation()
            assert.strictEqual(await fs.existsDir(outsideDir), true)
        } finally {
            await fs.delete(outsideDir, { force: true, recursive: true })
        }
    })

    it('handles already-deleted directory gracefully', async function () {
        const installDir = installer.getTestInstallDir()
        const assetDir = path.join(installDir, '1.0.0')
        // Don't create it — simulate it was already cleaned up

        await installer.simulateResolution(assetDir, 'remote')

        // Should not throw
        await installer.invalidateResolvedInstallation()
        assert.strictEqual(installer.getResolvedInstallation(), undefined)
    })

    it('handles no prior resolution gracefully', async function () {
        // No resolution set — should not throw
        await installer.invalidateResolvedInstallation()
        assert.strictEqual(installer.getResolvedInstallation(), undefined)
    })

    it('ensures retry cannot rediscover same broken cache', async function () {
        const installDir = installer.getTestInstallDir()
        const assetDir = path.join(installDir, '1.0.0')
        await fs.mkdir(assetDir)
        await fs.writeFile(path.join(assetDir, 'server.js'), 'broken content')

        await installer.simulateResolution(assetDir, 'cache')

        await installer.invalidateResolvedInstallation()

        // Both memory AND disk are cleared
        assert.strictEqual(installer.getResolvedInstallation(), undefined)
        assert.strictEqual(await fs.existsDir(assetDir), false)
    })
})

describe('BaseLspInstaller offline manifest fallback', function () {
    const tmpDir = useTempTestDir()

    function emptyManifest(location: 'cache' | 'remote'): Manifest {
        return {
            manifestSchemaVersion: '1.0',
            artifactId: 'test-lsp',
            artifactDescription: 'test',
            isManifestDeprecated: false,
            versions: [],
            location,
        }
    }

    function offlineInstaller(
        requiredFiles: string[] = ['server.js'],
        postInstall: (assetDirectory: string) => Promise<void> = async () => {},
        error = 'offline'
    ): TestLspInstaller {
        return new TestLspInstaller(tmpDir.path, requiredFiles, postInstall, async () => {
            throw new Error(error)
        })
    }

    function installerWithManifest(manifest: Manifest): TestLspInstaller {
        return new TestLspInstaller(
            tmpDir.path,
            [],
            async () => {},
            async () => manifest
        )
    }

    async function installServer(installDir: string, version: string): Promise<string> {
        const serverPath = path.join(installDir, version, 'server.js')
        await fs.mkdir(path.dirname(serverPath))
        await fs.writeFile(serverPath, 'content')
        return serverPath
    }

    it('resolves the highest complete installed server when no manifest is available', async function () {
        const installer = offlineInstaller()
        const serverPath = await installServer(installer.getTestInstallDir(), '1.0.0')

        const resolution = await installer.resolve()

        assert.strictEqual(resolution.location, 'fallback')
        assert.strictEqual(resolution.version, '1.0.0')
        assert.strictEqual(resolution.resourcePaths.lsp, serverPath)
    })

    it('uses an installed server when a cached manifest has no compatible version', async function () {
        const installer = installerWithManifest(emptyManifest('cache'))
        await installServer(tmpDir.path, '1.0.0')

        const resolution = await installer.resolve()

        assert.strictEqual(resolution.location, 'fallback')
        assert.strictEqual(resolution.version, '1.0.0')
    })

    it('reports manifest failure when a cached manifest has no compatible version or installed fallback', async function () {
        const installer = installerWithManifest(emptyManifest('cache'))

        await assert.rejects(installer.resolve(), (err: any) => err.code === 'ManifestFetchFailed')
    })

    it('does not use an installed server when a fresh manifest has no compatible version', async function () {
        const installer = installerWithManifest(emptyManifest('remote'))
        await installServer(tmpDir.path, '1.0.0')

        await assert.rejects(installer.resolve(), (err: any) => err.code === 'NoCompatibleVersion')
    })

    it('rethrows the manifest error when no usable server is installed', async function () {
        const installer = offlineInstaller(['server.js'], async () => {}, 'offline-and-empty')

        await assert.rejects(
            installer.resolve(),
            (err: any) => err.code === 'ManifestFetchFailed' && err.cause?.message === 'offline-and-empty'
        )
    })

    it('clears a previous resolution when a later resolve fails', async function () {
        const installer = offlineInstaller()
        const serverPath = await installServer(installer.getTestInstallDir(), '1.0.0')
        await installer.resolve()
        assert.strictEqual(installer.getResolvedInstallation()?.version, '1.0.0')

        await fs.delete(path.dirname(serverPath), { recursive: true })
        await assert.rejects(installer.resolve(), (err: any) => err.code === 'ManifestFetchFailed')

        assert.strictEqual(installer.getResolvedInstallation(), undefined)
    })

    it('runs postInstall on the offline fallback candidate', async function () {
        let hookedDir: string | undefined
        const installer = offlineInstaller(['server.js'], async (assetDirectory) => {
            hookedDir = assetDirectory
        })
        const installDir = installer.getTestInstallDir()
        await installServer(installDir, '1.0.0')

        const resolution = await installer.resolve()

        assert.strictEqual(resolution.version, '1.0.0')
        assert.strictEqual(hookedDir, path.join(installDir, '1.0.0'))
    })

    it('skips an install missing the server file and selects the highest complete one', async function () {
        const installer = offlineInstaller(['node_modules'])
        const installDir = installer.getTestInstallDir()

        await fs.mkdir(path.join(installDir, '1.5.0', 'node_modules'))
        await fs.mkdir(path.join(installDir, '1.0.0', 'node_modules'))
        const serverPath = await installServer(installDir, '1.0.0')

        const resolution = await installer.resolve()

        assert.strictEqual(resolution.version, '1.0.0')
        assert.strictEqual(resolution.resourcePaths.lsp, serverPath)
    })

    it('defers version cleanup to cleanupAfterResolve (offline fallback path)', async function () {
        const installer = offlineInstaller()
        const installDir = installer.getTestInstallDir()
        await installServer(installDir, '1.0.0')
        await installServer(installDir, '1.5.0')
        await fs.mkdir(path.join(installDir, '1.2.0'))

        const resolution = await installer.resolve()

        assert.strictEqual(resolution.version, '1.5.0')
        assert.strictEqual(await fs.existsDir(path.join(installDir, '1.5.0')), true)
        assert.strictEqual(await fs.existsDir(path.join(installDir, '1.0.0')), true)
        assert.strictEqual(await fs.existsDir(path.join(installDir, '1.2.0')), true)

        await installer.cleanupAfterResolve()

        assert.strictEqual(await fs.existsDir(path.join(installDir, '1.5.0')), true)
        assert.strictEqual(await fs.existsDir(path.join(installDir, '1.0.0')), true)
        assert.strictEqual(await fs.existsDir(path.join(installDir, '1.2.0')), false)
    })
})

describe('BaseLspInstaller local bundle override', function () {
    const tmpDir = new TempTestDir()

    beforeEach(async function () {
        await tmpDir.setup()
    })

    afterEach(async function () {
        await tmpDir.teardown()
    })

    it('resolves the local bundle root, bypassing the managed install', async function () {
        const bundleRoot = path.join(tmpDir.path, 'bundle')
        await fs.mkdir(bundleRoot)
        await fs.writeFile(path.join(bundleRoot, 'server.js'), 'content')
        const installer = new TestLspInstaller(
            tmpDir.path,
            [],
            async () => {},
            async () => {
                throw new Error('manifest must not be resolved for a local bundle')
            },
            bundleRoot
        )

        const resolution = await installer.resolve()

        assert.strictEqual(resolution.location, 'override')
        assert.strictEqual(resolution.version, '0.0.0')
        assert.strictEqual(resolution.assetDirectory, bundleRoot)
        assert.strictEqual(resolution.resourcePaths.lsp, path.join(bundleRoot, 'server.js'))
    })

    it('throws when the local bundle is missing the server file', async function () {
        const bundleRoot = path.join(tmpDir.path, 'empty-bundle')
        await fs.mkdir(bundleRoot)
        const installer = new TestLspInstaller(tmpDir.path, [], async () => {}, undefined, bundleRoot)

        await assert.rejects(installer.resolve(), /missing server file "server.js"/)
    })
})

describe('BaseLspInstaller.cleanupAfterResolve', function () {
    const tmpDir = new TempTestDir()

    beforeEach(async function () {
        await tmpDir.setup()
    })

    afterEach(async function () {
        await tmpDir.teardown()
    })

    it('is a no-op when nothing resolved', async function () {
        const installer = new TestLspInstaller(tmpDir.path)
        const installDir = installer.getTestInstallDir()
        await fs.mkdir(path.join(installDir, '1.0.0'))
        await fs.mkdir(path.join(installDir, '2.0.0'))

        await installer.cleanupAfterResolve()

        assert.strictEqual(await fs.existsDir(path.join(installDir, '1.0.0')), true)
        assert.strictEqual(await fs.existsDir(path.join(installDir, '2.0.0')), true)
    })

    it('is a no-op for a local override resolution', async function () {
        const installer = new TestLspInstaller(tmpDir.path)
        const installDir = installer.getTestInstallDir()
        await fs.mkdir(path.join(installDir, '1.0.0'))
        await fs.mkdir(path.join(installDir, '2.0.0'))
        await installer.simulateResolution(path.join(installDir, '1.0.0'), 'override')

        await installer.cleanupAfterResolve()

        assert.strictEqual(await fs.existsDir(path.join(installDir, '1.0.0')), true)
        assert.strictEqual(await fs.existsDir(path.join(installDir, '2.0.0')), true)
    })

    it('logs and swallows a cleanup failure without failing resolution', async function () {
        const sandbox = sinon.createSandbox()
        try {
            const installer = new TestLspInstaller(tmpDir.path)
            const installDir = installer.getTestInstallDir()
            await fs.mkdir(path.join(installDir, '1.0.0'))
            await installer.simulateResolution(path.join(installDir, '1.0.0'), 'cache')

            sandbox.stub(fs, 'readdir').rejects(new Error('disk on fire'))

            await assert.doesNotReject(installer.cleanupAfterResolve())
        } finally {
            sandbox.restore()
        }
    })
})

describe('BaseLspInstaller remote postInstall failure', function () {
    const tmpDir = new TempTestDir()
    let sandbox: sinon.SinonSandbox

    beforeEach(async function () {
        sandbox = sinon.createSandbox()
        await tmpDir.setup()
    })

    afterEach(async function () {
        sandbox.restore()
        await tmpDir.teardown()
    })

    it('removes the failed remote version and uses an installed fallback', async function () {
        const manifest: Manifest = {
            manifestSchemaVersion: '1.0',
            artifactId: 'test-lsp',
            artifactDescription: 'test',
            isManifestDeprecated: false,
            location: 'remote',
            versions: [
                {
                    serverVersion: '1.9.0',
                    isDelisted: false,
                    targets: [
                        {
                            platform: process.platform,
                            arch: process.arch === 'arm' || process.arch === 'arm64' ? 'arm64' : 'x64',
                            contents: [
                                {
                                    filename: 'server.js',
                                    url: 'https://example.com/server.js',
                                    hashes: [],
                                    bytes: 0,
                                },
                            ],
                        },
                    ],
                },
            ],
        }
        const installer = new TestLspInstaller(
            tmpDir.path,
            [],
            async (assetDirectory) => {
                if (path.basename(assetDirectory) === '1.9.0') {
                    throw new Error('postInstall failed')
                }
            },
            async () => manifest
        )
        await fs.mkdir(path.join(tmpDir.path, '1.5.0'))
        await fs.writeFile(path.join(tmpDir.path, '1.5.0', 'server.js'), 'fallback')
        sandbox.stub(globalThis, 'fetch').resolves(new Response('fresh', { status: 200 }))

        const resolution = await installer.resolve()

        assert.strictEqual(resolution.location, 'fallback')
        assert.strictEqual(resolution.version, '1.5.0')
        assert.strictEqual(await fs.existsDir(path.join(tmpDir.path, '1.9.0')), false)
    })
})
