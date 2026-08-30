/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Uri } from 'vscode'
import { cleanLspDownloads, fs, getDownloadedVersions } from '../../../../shared'
import { createTestWorkspaceFolder } from '../../../testUtil'
import path from 'path'
import assert from 'assert'

async function fakeInstallVersion(version: string, installationDir: string, empty = false): Promise<void> {
    const versionDir = path.join(installationDir, version)
    await fs.mkdir(versionDir)
    if (!empty) {
        await fs.writeFile(path.join(versionDir, 'file.txt'), 'content')
    }
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

    it('retains current version + highest valid fallback', async function () {
        await fakeInstallVersions(['1.0.0', '1.0.1', '1.1.1', '2.1.1'], installationDir.fsPath)
        const deleted = await cleanLspDownloads('2.1.1', [], installationDir.fsPath)

        const result = (await fs.readdir(installationDir.fsPath)).map(([filename, _filetype], _index) => filename)
        assert.strictEqual(result.length, 2)
        assert.ok(result.includes('2.1.1'))
        assert.ok(result.includes('1.1.1'))
        assert.strictEqual(deleted.length, 2)
    })

    it('deletes delisted versions', async function () {
        await fakeInstallVersions(['1.0.0', '1.0.1', '1.1.1', '2.1.1'], installationDir.fsPath)
        const deleted = await cleanLspDownloads(
            '2.1.1',
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
            '1.0.1',
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
        const deleted = await cleanLspDownloads('1.0.0', [], installationDir.fsPath)

        const result = (await fs.readdir(installationDir.fsPath)).map(([filename, _filetype], _index) => filename)
        assert.strictEqual(result.length, 1)
        assert.strictEqual(deleted.length, 0)
    })

    it('does not install delisted version when no other option exists', async function () {
        await fakeInstallVersions(['1.0.0'], installationDir.fsPath)
        const deleted = await cleanLspDownloads(
            '1.0.0',
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
            '1.0.0',
            [{ serverVersion: '1.0.0', isDelisted: true, targets: [] }],
            installationDir.fsPath
        )

        const result = await getDownloadedVersions(installationDir.fsPath)
        assert.strictEqual(result.length, 0)
        assert.strictEqual(deleted.length, 1)
    })

    it('skips empty directories as invalid fallback candidates', async function () {
        await fakeInstallVersions(['1.0.0', '2.0.0', '3.0.0'], installationDir.fsPath)
        const emptyDir = path.join(installationDir.fsPath, '2.0.0')
        const entries = await fs.readdir(emptyDir)
        for (const [name] of entries) {
            await fs.delete(path.join(emptyDir, name))
        }

        const deleted = await cleanLspDownloads('3.0.0', [], installationDir.fsPath)

        const result = (await fs.readdir(installationDir.fsPath)).map(([filename]) => filename)
        assert.ok(result.includes('3.0.0'))
        assert.ok(result.includes('1.0.0'))
        assert.strictEqual(deleted.length, 1)
    })

    it('retains only current when all other versions are invalid', async function () {
        await fakeInstallVersion('1.0.0', installationDir.fsPath, true)
        await fakeInstallVersion('2.0.0', installationDir.fsPath, true)
        await fakeInstallVersion('3.0.0', installationDir.fsPath)

        const deleted = await cleanLspDownloads('3.0.0', [], installationDir.fsPath)

        const result = (await fs.readdir(installationDir.fsPath)).map(([filename]) => filename)
        assert.ok(result.includes('3.0.0'))
        assert.strictEqual(deleted.length, 2)
    })

    it('uses injected validator to determine cache validity', async function () {
        await fakeInstallVersions(['1.0.0', '2.0.0', '3.0.0'], installationDir.fsPath)
        // 2.0.0 has content but our validator says it's invalid (simulating missing required file)
        const validator = async (versionDir: string): Promise<boolean> => {
            return !versionDir.includes('2.0.0')
        }

        const deleted = await cleanLspDownloads('3.0.0', [], installationDir.fsPath, validator)

        const result = (await fs.readdir(installationDir.fsPath)).map(([filename]) => filename)
        assert.ok(result.includes('3.0.0'))
        assert.ok(result.includes('1.0.0'))
        assert.ok(!result.includes('2.0.0'))
        assert.strictEqual(deleted.length, 1)
    })

    it('deletes invalid non-empty newer directory and retains highest fully valid fallback', async function () {
        // 4.0.0 is current, 3.0.0 is non-empty but invalid, 2.0.0 is valid, 1.0.0 is valid
        await fakeInstallVersions(['1.0.0', '2.0.0', '3.0.0', '4.0.0'], installationDir.fsPath)

        // Validator: 3.0.0 fails (missing required file), others pass
        const validator = async (versionDir: string): Promise<boolean> => {
            return !versionDir.includes('3.0.0')
        }

        const deleted = await cleanLspDownloads('4.0.0', [], installationDir.fsPath, validator)

        const result = (await fs.readdir(installationDir.fsPath)).map(([filename]) => filename)
        // Should retain 4.0.0 (current) and 2.0.0 (highest valid fallback)
        assert.ok(result.includes('4.0.0'), 'current version should be retained')
        assert.ok(result.includes('2.0.0'), 'highest valid fallback should be retained')
        assert.ok(!result.includes('3.0.0'), 'invalid non-empty newer dir should be deleted')
        assert.ok(!result.includes('1.0.0'), 'lower valid version should be deleted')
        assert.strictEqual(deleted.length, 2)
    })
})
