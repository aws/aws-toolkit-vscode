/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import path from 'path'
import * as nodeFs from 'fs' // eslint-disable-line no-restricted-imports
import { Uri } from 'vscode'
import { fs } from '../../../../shared'
import { createTestWorkspaceFolder } from '../../../testUtil'
import { InUseTracker } from '../../../../shared/lsp/utils/inUseTracker'

const DeadPid = 2 ** 22

describe('InUseTracker', function () {
    let workspaceDir: Uri
    let versionDir: string
    let tracker: InUseTracker

    before(async function () {
        workspaceDir = (await createTestWorkspaceFolder()).uri
    })

    beforeEach(async function () {
        versionDir = path.join(workspaceDir.fsPath, `v-${Date.now()}-${Math.random()}`)
        await fs.mkdir(versionDir)
        tracker = new InUseTracker()
    })

    after(async function () {
        await fs.delete(workspaceDir, { force: true, recursive: true })
    })

    it('writeMarker creates an .inuse.<pid> file in the version directory', function () {
        tracker.writeMarker(versionDir, 'aws-toolkit-vscode')

        const markerPath = path.join(versionDir, `.inuse.${process.pid}`)
        assert.strictEqual(nodeFs.existsSync(markerPath), true)
        const payload = JSON.parse(nodeFs.readFileSync(markerPath, 'utf-8'))
        assert.strictEqual(payload.pid, process.pid)
        assert.strictEqual(payload.app, 'aws-toolkit-vscode')
        assert.strictEqual(typeof payload.timestamp, 'number')
    })

    it('writeMarker swallows errors when directory does not exist', function () {
        assert.doesNotThrow(() => tracker.writeMarker(path.join(versionDir, 'missing'), 'app'))
    })

    it("removeMarker deletes this process's marker", function () {
        tracker.writeMarker(versionDir, 'app')
        const markerPath = path.join(versionDir, `.inuse.${process.pid}`)
        assert.strictEqual(nodeFs.existsSync(markerPath), true)

        tracker.removeMarker(versionDir)

        assert.strictEqual(nodeFs.existsSync(markerPath), false)
    })

    it('removeMarker is a no-op when no marker exists', function () {
        assert.doesNotThrow(() => tracker.removeMarker(versionDir))
    })

    it('isInUse returns true when a live-pid marker exists', function () {
        tracker.writeMarker(versionDir, 'app')

        assert.strictEqual(tracker.isInUse(versionDir), true)
    })

    it('isInUse returns false when only dead-pid markers exist', function () {
        nodeFs.writeFileSync(path.join(versionDir, `.inuse.${DeadPid}`), '{}')

        assert.strictEqual(tracker.isInUse(versionDir), false)
    })

    it('isInUse ignores non-marker files', function () {
        nodeFs.writeFileSync(path.join(versionDir, 'readme.txt'), 'hi')
        nodeFs.writeFileSync(path.join(versionDir, '.inuse.notanumber'), '{}')

        assert.strictEqual(tracker.isInUse(versionDir), false)
    })

    it('isInUse returns false when directory does not exist', function () {
        assert.strictEqual(tracker.isInUse(path.join(versionDir, 'missing')), false)
    })

    it('cleanStaleMarkers removes dead-pid markers and keeps live-pid markers', function () {
        const liveMarker = path.join(versionDir, `.inuse.${process.pid}`)
        const staleMarker = path.join(versionDir, `.inuse.${DeadPid}`)
        nodeFs.writeFileSync(liveMarker, '{}')
        nodeFs.writeFileSync(staleMarker, '{}')

        tracker.cleanStaleMarkers(versionDir)

        assert.strictEqual(nodeFs.existsSync(liveMarker), true)
        assert.strictEqual(nodeFs.existsSync(staleMarker), false)
    })

    it('cleanStaleMarkers does not touch non-marker files', function () {
        const unrelated = path.join(versionDir, 'data.json')
        nodeFs.writeFileSync(unrelated, '{}')

        tracker.cleanStaleMarkers(versionDir)

        assert.strictEqual(nodeFs.existsSync(unrelated), true)
    })
})
