/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Uri } from 'vscode'
import { cleanLspDownloads, fs, getDownloadedVersions } from '../../../../shared'
import { createTestWorkspaceFolder } from '../../../testUtil'
import path from 'path'
import assert from 'assert'
import * as nodeFs from 'fs' // eslint-disable-line no-restricted-imports

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

describe('cleanLspDownloads', function () {
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

    it('keeps current version and one highest fallback, deletes the rest', async function () {
        await fakeInstallVersions(['1.0.0', '1.0.1', '1.1.1', '2.1.1'], installationDir.fsPath)

        const deleted = await cleanLspDownloads('2.1.1', [], installationDir.fsPath)

        const remaining = (await fs.readdir(installationDir.fsPath)).map(([name]) => name).sort()
        assert.deepStrictEqual(remaining, ['1.1.1', '2.1.1'])
        assert.strictEqual(deleted.length, 2)
    })

    it('keeps only current version when it is the sole downloaded version', async function () {
        await fakeInstallVersions(['1.0.0'], installationDir.fsPath)

        const deleted = await cleanLspDownloads('1.0.0', [], installationDir.fsPath)

        const remaining = (await fs.readdir(installationDir.fsPath)).map(([name]) => name)
        assert.deepStrictEqual(remaining, ['1.0.0'])
        assert.strictEqual(deleted.length, 0)
    })

    it('keeps current version even when it is not the highest installed', async function () {
        await fakeInstallVersions(['1.0.0', '2.0.0', '3.0.0'], installationDir.fsPath)

        await cleanLspDownloads('1.0.0', [], installationDir.fsPath)

        const remaining = (await fs.readdir(installationDir.fsPath)).map(([name]) => name).sort()
        assert.deepStrictEqual(remaining, ['1.0.0', '3.0.0'])
    })

    it('ignores entries that are not valid semver', async function () {
        await fakeInstallVersions(['1.0.0', '2.0.0'], installationDir.fsPath)
        await fs.mkdir(path.join(installationDir.fsPath, '.DS_STORE'))

        await cleanLspDownloads('2.0.0', [], installationDir.fsPath)

        const versions = await getDownloadedVersions(installationDir.fsPath)
        assert.deepStrictEqual(versions.sort(), ['1.0.0', '2.0.0'])
    })

    it('skips deletion of versions currently in use by a live process', async function () {
        await fakeInstallVersions(['1.0.0', '2.0.0', '3.0.0'], installationDir.fsPath)
        // Current pid counts as "in use" — process.kill(pid, 0) succeeds
        nodeFs.writeFileSync(path.join(installationDir.fsPath, '1.0.0', `.inuse.${process.pid}`), '{}')

        const deleted = await cleanLspDownloads('3.0.0', [], installationDir.fsPath)

        const remaining = (await fs.readdir(installationDir.fsPath)).map(([name]) => name).sort()
        // keep set = {3.0.0 (current), 2.0.0 (fallback)}; 1.0.0 survives via in-use marker
        assert.deepStrictEqual(remaining, ['1.0.0', '2.0.0', '3.0.0'])
        assert.strictEqual(deleted.length, 0)
    })

    it('deletes versions whose markers reference dead pids', async function () {
        await fakeInstallVersions(['1.0.0', '2.0.0', '3.0.0'], installationDir.fsPath)
        const deadPid = 2 ** 22 // far beyond any realistic live pid
        nodeFs.writeFileSync(path.join(installationDir.fsPath, '1.0.0', `.inuse.${deadPid}`), '{}')

        const deleted = await cleanLspDownloads('3.0.0', [], installationDir.fsPath)

        const remaining = (await fs.readdir(installationDir.fsPath)).map(([name]) => name).sort()
        assert.deepStrictEqual(remaining, ['2.0.0', '3.0.0'])
        assert.deepStrictEqual(deleted, ['1.0.0'])
    })

    it('sweeps stale tmp directories with dead pids', async function () {
        await fakeInstallVersions(['1.0.0'], installationDir.fsPath)
        const deadPid = 2 ** 22
        const staleTmp = path.join(installationDir.fsPath, `1.0.0.tmp.${deadPid}`)
        const liveTmp = path.join(installationDir.fsPath, `1.0.0.tmp.${process.pid}`)
        await fs.mkdir(staleTmp)
        await fs.mkdir(liveTmp)

        await cleanLspDownloads('1.0.0', [], installationDir.fsPath)

        assert.strictEqual(nodeFs.existsSync(staleTmp), false)
        assert.strictEqual(nodeFs.existsSync(liveTmp), true)
    })
})
