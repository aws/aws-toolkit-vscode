/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Uri } from 'vscode'
import { fs } from '../../../shared'
import { createTestWorkspaceFolder } from '../../testUtil'
import path from 'path'
import { WorkspaceLSPResolver } from '../../../amazonq/lsp/workspaceInstaller'
import assert from 'assert'

async function fakeInstallVersion(version: string, installationDir: string): Promise<void> {
    const versionDir = path.join(installationDir, version)
    await fs.mkdir(versionDir)
    await fs.writeFile(path.join(versionDir, 'file.txt'), 'content')
}

describe('workspaceInstaller', function () {
    describe('cleanUp', function () {
        let installationDir: Uri
        let lspVersions: string[]

        before(async function () {
            installationDir = (await createTestWorkspaceFolder()).uri
            lspVersions = ['1.0.0', '1.0.1', '1.1.1', '2.1.1']
        })

        beforeEach(async function () {
            for (const v of lspVersions) {
                await fakeInstallVersion(v, installationDir.fsPath)
            }
        })

        after(async function () {
            await fs.delete(installationDir, { force: true, recursive: true })
        })
        it('keeps two newest versions', async function () {
            const wsr = new WorkspaceLSPResolver()
            await wsr.cleanUp([], installationDir.fsPath)

            const result = (await fs.readdir(installationDir.fsPath)).map(([filename, _filetype], _index) => filename)
            assert.strictEqual(result.length, 2)
            assert.ok(result.includes('2.1.1'))
            assert.ok(result.includes('1.1.1'))
        })

        it('deletes delisted versions', async function () {
            const wsr = new WorkspaceLSPResolver()
            await wsr.cleanUp([{ serverVersion: '1.1.1', isDelisted: true, targets: [] }], installationDir.fsPath)

            const result = (await fs.readdir(installationDir.fsPath)).map(([filename, _filetype], _index) => filename)
            assert.strictEqual(result.length, 2)
            assert.ok(result.includes('2.1.1'))
            assert.ok(result.includes('1.0.1'))
        })

        it('handles case where less than 2 versions are not delisted', async function () {
            const wsr = new WorkspaceLSPResolver()
            await wsr.cleanUp(
                [
                    { serverVersion: '1.1.1', isDelisted: true, targets: [] },
                    { serverVersion: '2.1.1', isDelisted: true, targets: [] },
                    { serverVersion: '1.0.0', isDelisted: true, targets: [] },
                ],
                installationDir.fsPath
            )

            const result = (await fs.readdir(installationDir.fsPath)).map(([filename, _filetype], _index) => filename)
            assert.strictEqual(result.length, 1)
            assert.ok(result.includes('1.0.1'))
        })
    })
})
