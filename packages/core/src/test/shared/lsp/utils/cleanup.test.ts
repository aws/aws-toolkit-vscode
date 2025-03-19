/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Uri } from 'vscode'
import { cleanLspDownloads, fs, getDownloadedVersions } from '../../../../shared'
import { createTestWorkspaceFolder } from '../../../testUtil'
import path from 'path'
import assert from 'assert'

async function fakeInstallVersion(version: string, installationDir: string): Promise<void> {
    const versionDir = path.join(installationDir, version)
    await fs.mkdir(versionDir)
    await fs.writeFile(path.join(versionDir, 'file.txt'), 'content')
}

async function fakeInstallVersions(versions: string[], installationDir: string): Promise<void> {
    for (const v of versions) {
        await fakeInstallVersion(v, installationDir)
    }
}

describe('cleanLSPDownloads', function () {
    let installationDir: Uri

    before(async function () {
        installationDir = (await createTestWorkspaceFolder()).uri
    })

    afterEach(async function () {
        const files = await fs.readdir(installationDir.fsPath)
        for (const [name, _type] of files) {
            await fs.delete(path.join(installationDir.fsPath, name), { force: true, recursive: true })
        }
    })

    after(async function () {
        await fs.delete(installationDir, { force: true, recursive: true })
    })

    it('keeps two newest versions', async function () {
        await fakeInstallVersions(['1.0.0', '1.0.1', '1.1.1', '2.1.1'], installationDir.fsPath)
        const deleted = await cleanLspDownloads([], installationDir.fsPath)

        const result = (await fs.readdir(installationDir.fsPath)).map(([filename, _filetype], _index) => filename)
        assert.strictEqual(result.length, 2)
        assert.ok(result.includes('2.1.1'))
        assert.ok(result.includes('1.1.1'))
        assert.strictEqual(deleted.length, 2)
    })

    it('deletes delisted versions', async function () {
        await fakeInstallVersions(['1.0.0', '1.0.1', '1.1.1', '2.1.1'], installationDir.fsPath)
        const deleted = await cleanLspDownloads(
            [{ serverVersion: '1.1.1', isDelisted: true, targets: [] }],
            installationDir.fsPath
        )

        const result = (await fs.readdir(installationDir.fsPath)).map(([filename, _filetype], _index) => filename)
        assert.strictEqual(result.length, 2)
        assert.ok(result.includes('2.1.1'))
        assert.ok(result.includes('1.0.1'))
        assert.strictEqual(deleted.length, 2)
    })

    it('handles case where less than 2 versions are not delisted', async function () {
        await fakeInstallVersions(['1.0.0', '1.0.1', '1.1.1', '2.1.1'], installationDir.fsPath)
        const deleted = await cleanLspDownloads(
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
        assert.strictEqual(deleted.length, 3)
    })

    it('handles case where less than 2 versions exist', async function () {
        await fakeInstallVersions(['1.0.0'], installationDir.fsPath)
        const deleted = await cleanLspDownloads([], installationDir.fsPath)

        const result = (await fs.readdir(installationDir.fsPath)).map(([filename, _filetype], _index) => filename)
        assert.strictEqual(result.length, 1)
        assert.strictEqual(deleted.length, 0)
    })

    it('does not install delisted version when no other option exists', async function () {
        await fakeInstallVersions(['1.0.0'], installationDir.fsPath)
        const deleted = await cleanLspDownloads(
            [{ serverVersion: '1.0.0', isDelisted: true, targets: [] }],
            installationDir.fsPath
        )

        const result = (await fs.readdir(installationDir.fsPath)).map(([filename, _filetype], _index) => filename)
        assert.strictEqual(result.length, 0)
        assert.strictEqual(deleted.length, 1)
    })

    it('ignores invalid versions', async function () {
        await fakeInstallVersions(['1.0.0', '.DS_STORE'], installationDir.fsPath)
        const deleted = await cleanLspDownloads(
            [{ serverVersion: '1.0.0', isDelisted: true, targets: [] }],
            installationDir.fsPath
        )

        const result = await getDownloadedVersions(installationDir.fsPath)
        assert.strictEqual(result.length, 0)
        assert.strictEqual(deleted.length, 1)
    })
})
