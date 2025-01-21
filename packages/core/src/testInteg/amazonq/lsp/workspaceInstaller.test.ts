/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Range } from 'semver'
import assert from 'assert'
import { WorkspaceLSPResolver } from '../../../amazonq/lsp/workspaceInstaller'
import { fs } from '../../../shared/fs/fs'
import path from 'path'
import * as sinon from 'sinon'
import { langugeServerDefaultDir } from '../../../shared/lsp/lspResolver'

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
    before(async function () {
        await fs.delete(langugeServerDefaultDir, { force: true, recursive: true })
    })

    it('removes all but the latest two versions', async function () {
        const versionsToInstall = ['0.1.25', '0.1.26', '0.1.27', '0.1.28']
        const versionsDownloaded = await testInstallVersions(versionsToInstall)

        assert.strictEqual(versionsDownloaded.length, 2)
        assert.ok(versionsDownloaded.includes('0.1.28'))
        assert.ok(versionsDownloaded.includes('0.1.29'))
    })

    it('removes delisted versions then keeps 2 remaining most recent', async function () {
        const isDelisted = sinon.stub(WorkspaceLSPResolver.prototype, 'isDelisted' as any)
        isDelisted.callsFake((_manifestVersions, version) => {
            return version === '0.1.27' || version === '0.1.29'
        })

        const versionsToInstall = ['0.1.25', '0.1.26', '0.1.27', '0.1.28']
        const versionsDownloaded = await testInstallVersions(versionsToInstall)

        console.log(versionsDownloaded)
        assert.strictEqual(versionsDownloaded.length, 2)
        assert.ok(versionsDownloaded.includes('0.1.28'))
        assert.ok(versionsDownloaded.includes('0.1.26'))
        isDelisted.restore()
    })
})
