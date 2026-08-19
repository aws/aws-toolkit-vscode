/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as path from 'path'
import { BaseLspInstaller } from '../../../shared/lsp/baseLspInstaller'
import { ResourcePaths } from '../../../shared/lsp/types'
import { fs } from '../../../shared/fs/fs'
import { createTestWorkspaceFolder } from '../../testUtil'

/**
 * Concrete test implementation of BaseLspInstaller for testing invalidation.
 */
class TestLspInstaller extends BaseLspInstaller {
    constructor(
        baseDir: string,
        requiredFiles: string[] = [],
        private readonly postInstallAction: (assetDirectory: string) => Promise<void> = async () => {}
    ) {
        super(
            {
                manifestUrl: 'https://example.com/manifest.json',
                supportedVersions: '<2.0.0',
                id: 'test-lsp',
                suppressPromptPrefix: 'test',
                baseDir,
                requiredFiles,
            },
            'awsCfnLsp'
        )
    }

    protected async postInstall(assetDirectory: string): Promise<void> {
        await this.postInstallAction(assetDirectory)
    }

    runPostInstallForTest(assetDirectory: string): Promise<void> {
        return this.runPostInstall(assetDirectory)
    }

    protected resourcePaths(assetDirectory?: string): ResourcePaths {
        return {
            lsp: assetDirectory ? path.join(assetDirectory, 'server.js') : 'server.js',
            node: process.execPath,
        }
    }

    /**
     * Simulate a resolved installation for testing purposes.
     * Sets the internal resolvedInstallation directly.
     */
    simulateResolution(assetDir: string, location: 'cache' | 'remote' | 'fallback' | 'override'): void {
        // Access private field via casting for testing
        ;(this as any).resolvedInstallation = {
            assetDirectory: assetDir,
            location,
            version: '1.0.0',
            resourcePaths: this.resourcePaths(assetDir),
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
    let testDir: string

    beforeEach(async function () {
        const folder = await createTestWorkspaceFolder()
        testDir = folder.uri.fsPath
    })

    afterEach(async function () {
        await fs.delete(testDir, { force: true, recursive: true })
    })

    it('runs postInstall before verifying the optional file list', async function () {
        const assetDir = path.join(testDir, 'language-servers', 'test-lsp', '1.0.0')
        const requiredFile = path.join(assetDir, 'server.js')
        await fs.mkdir(assetDir)
        await fs.writeFile(requiredFile, 'content')
        let hookCalled = false
        const installer = new TestLspInstaller(testDir, ['server.js'], async () => {
            hookCalled = true
            await fs.delete(requiredFile)
        })

        await assert.rejects(
            installer.runPostInstallForTest(assetDir),
            /Required files missing after install.*server.js/
        )
        assert.strictEqual(hookCalled, true)
    })

    it('does not require verification files when none are configured', async function () {
        let hookCalled = false
        const installer = new TestLspInstaller(testDir, [], async () => {
            hookCalled = true
        })

        await assert.doesNotReject(installer.runPostInstallForTest(testDir))
        assert.strictEqual(hookCalled, true)
    })
})

describe('BaseLspInstaller.invalidateResolvedInstallation', function () {
    let testDir: string
    let installer: TestLspInstaller

    beforeEach(async function () {
        const folder = await createTestWorkspaceFolder()
        testDir = folder.uri.fsPath
        installer = new TestLspInstaller(testDir)
    })

    afterEach(async function () {
        await fs.delete(testDir, { force: true, recursive: true })
    })

    it('clears resolved installation from memory', async function () {
        const installDir = installer.getTestInstallDir()
        const assetDir = path.join(installDir, '1.0.0')
        await fs.mkdir(assetDir)
        await fs.writeFile(path.join(assetDir, 'server.js'), 'content')

        installer.simulateResolution(assetDir, 'cache')
        assert.ok(installer.getResolvedInstallation())

        await installer.invalidateResolvedInstallation()

        assert.strictEqual(installer.getResolvedInstallation(), undefined)
    })

    it('deletes managed asset directory within installDir', async function () {
        const installDir = installer.getTestInstallDir()
        const assetDir = path.join(installDir, '1.0.0')
        await fs.mkdir(assetDir)
        await fs.writeFile(path.join(assetDir, 'server.js'), 'content')

        installer.simulateResolution(assetDir, 'cache')

        await installer.invalidateResolvedInstallation()

        // Asset directory should be deleted
        assert.strictEqual(await fs.existsDir(assetDir), false)
    })

    it('does NOT delete override/external installation', async function () {
        const externalDir = path.join(testDir, 'external-server')
        await fs.mkdir(externalDir)
        await fs.writeFile(path.join(externalDir, 'server.js'), 'content')

        installer.simulateResolution(externalDir, 'override')

        await installer.invalidateResolvedInstallation()

        // External directory should NOT be deleted
        assert.strictEqual(await fs.existsDir(externalDir), true)
    })

    it('does NOT delete directories outside of installDir', async function () {
        const outsideDir = path.join(testDir, 'outside-managed-dir')
        await fs.mkdir(outsideDir)
        await fs.writeFile(path.join(outsideDir, 'server.js'), 'content')

        installer.simulateResolution(outsideDir, 'remote')

        await installer.invalidateResolvedInstallation()

        // Outside directory should NOT be deleted (path traversal protection)
        assert.strictEqual(await fs.existsDir(outsideDir), true)
    })

    it('handles already-deleted directory gracefully', async function () {
        const installDir = installer.getTestInstallDir()
        const assetDir = path.join(installDir, '1.0.0')
        // Don't create it — simulate it was already cleaned up

        installer.simulateResolution(assetDir, 'remote')

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

        installer.simulateResolution(assetDir, 'cache')

        await installer.invalidateResolvedInstallation()

        // Both memory AND disk are cleared
        assert.strictEqual(installer.getResolvedInstallation(), undefined)
        assert.strictEqual(await fs.existsDir(assetDir), false)
    })
})
