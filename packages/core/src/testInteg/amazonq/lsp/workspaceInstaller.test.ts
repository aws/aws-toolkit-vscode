/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Range, sort } from 'semver'
import assert from 'assert'
import { lspWorkspaceName, lspManifestUrl, WorkspaceLSPResolver } from '../../../amazonq/lsp/workspaceInstaller'
import { fs } from '../../../shared/fs/fs'
import path from 'path'
import * as sinon from 'sinon'
import { langugeServerDefaultDir } from '../../../shared/lsp/lspResolver'
import { ManifestResolver } from '../../../shared'

async function installVersion(version: string, cleanUp: boolean = false) {
    const resolver = new WorkspaceLSPResolver({ versionRange: new Range(version), cleanUp: cleanUp })
    return await resolver.resolve()
}

/**
 * Installs all versions, only running 'cleanUp' on the last install.
 * @param versions
 * @returns
 */
async function testInstallVersions(versions: string[]) {
    await Promise.all(versions.slice(0, -1).map(async (version) => await installVersion(version)))
    const finalVersionResult = await installVersion(versions[versions.length - 1], true)
    const allVersions = path.dirname(finalVersionResult.assetDirectory)
    const versionsDownloaded = (await fs.readdir(allVersions)).map(([f, _], __) => f)
    return versionsDownloaded
}

describe('workspaceInstaller', function () {
    let testVersions: string[]
    before(async function () {
        await fs.delete(langugeServerDefaultDir, { force: true, recursive: true })
        const manifest = await new ManifestResolver(lspManifestUrl, lspWorkspaceName).resolve()
        testVersions = sort(
            manifest.versions
                .filter((v) => !v.isDelisted)
                .slice(0, 4)
                .map((v) => v.serverVersion)
        )
    })

    it('removes all but the latest two versions', async function () {
        const versionsDownloaded = await testInstallVersions(testVersions)

        assert.strictEqual(versionsDownloaded.length, 2)
        assert.ok(versionsDownloaded.includes(testVersions[testVersions.length - 1]))
        assert.ok(versionsDownloaded.includes(testVersions[testVersions.length - 2]))
    })

    it('removes delisted versions then keeps 2 remaining most recent', async function () {
        const isDelisted = sinon.stub(WorkspaceLSPResolver.prototype, 'isDelisted' as any)
        isDelisted.callsFake((_manifestVersions, version) => {
            return version === testVersions[testVersions.length - 2]
        })

        const versionsDownloaded = await testInstallVersions(testVersions)

        assert.strictEqual(versionsDownloaded.length, 2)
        assert.ok(versionsDownloaded.includes(testVersions[testVersions.length - 1]))
        assert.ok(versionsDownloaded.includes(testVersions[testVersions.length - 3]))
        isDelisted.restore()
    })
})
