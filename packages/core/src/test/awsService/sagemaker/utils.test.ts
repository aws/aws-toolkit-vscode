/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppStatus, SpaceStatus } from '@aws-sdk/client-sagemaker'
import { generateSpaceStatus, ActivityCheckInterval } from '../../../awsService/sagemaker/utils'
import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { getTestWindow } from '../../shared/vscode/window'
import { fs } from '../../../shared/fs/fs'
import * as utils from '../../../awsService/sagemaker/utils'

describe('generateSpaceStatus', function () {
    it('returns Failed if space status is Failed', function () {
        assert.strictEqual(generateSpaceStatus(SpaceStatus.Failed, AppStatus.InService), 'Failed')
    })

    it('returns Failed if space status is Delete_Failed', function () {
        assert.strictEqual(generateSpaceStatus(SpaceStatus.Delete_Failed, AppStatus.InService), 'Failed')
    })

    it('returns Failed if space status is Update_Failed', function () {
        assert.strictEqual(generateSpaceStatus(SpaceStatus.Update_Failed, AppStatus.InService), 'Failed')
    })

    it('returns Failed if app status is Failed and space status is not Updating', function () {
        assert.strictEqual(generateSpaceStatus(SpaceStatus.Deleting, AppStatus.Failed), 'Failed')
    })

    it('does not return Failed if app status is Failed but space status is Updating', function () {
        assert.strictEqual(generateSpaceStatus(SpaceStatus.Updating, AppStatus.Failed), 'Updating')
    })

    it('returns Running if both statuses are InService', function () {
        assert.strictEqual(generateSpaceStatus(SpaceStatus.InService, AppStatus.InService), 'Running')
    })

    it('returns Starting if app is Pending and space is InService', function () {
        assert.strictEqual(generateSpaceStatus(SpaceStatus.InService, AppStatus.Pending), 'Starting')
    })

    it('returns Updating if space status is Updating', function () {
        assert.strictEqual(generateSpaceStatus(SpaceStatus.Updating, AppStatus.Deleting), 'Updating')
    })

    it('returns Stopping if app is Deleting and space is InService', function () {
        assert.strictEqual(generateSpaceStatus(SpaceStatus.InService, AppStatus.Deleting), 'Stopping')
    })

    it('returns Stopped if app is Deleted and space is InService', function () {
        assert.strictEqual(generateSpaceStatus(SpaceStatus.InService, AppStatus.Deleted), 'Stopped')
    })

    it('returns Stopped if app status is undefined and space is InService', function () {
        assert.strictEqual(generateSpaceStatus(SpaceStatus.InService, undefined), 'Stopped')
    })

    it('returns Deleting if space is Deleting', function () {
        assert.strictEqual(generateSpaceStatus(SpaceStatus.Deleting, AppStatus.InService), 'Deleting')
    })

    it('returns Unknown if none of the above match', function () {
        assert.strictEqual(generateSpaceStatus(undefined, undefined), 'Unknown')
        assert.strictEqual(
            generateSpaceStatus('SomeOtherStatus' as SpaceStatus, 'RandomAppStatus' as AppStatus),
            'Unknown'
        )
    })
})

describe('checkTerminalActivity', function () {
    let sandbox: sinon.SinonSandbox
    let fsReaddirStub: sinon.SinonStub
    let fsStatStub: sinon.SinonStub
    let fsWriteFileStub: sinon.SinonStub

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        fsReaddirStub = sandbox.stub(fs, 'readdir')
        fsStatStub = sandbox.stub(fs, 'stat')
        fsWriteFileStub = sandbox.stub(fs, 'writeFile')
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('should write to idle file when recent terminal activity is detected', async function () {
        const idleFilePath = '/tmp/test-idle-file'
        const recentTime = Date.now() - ActivityCheckInterval / 2 // Recent activity

        fsReaddirStub.resolves([
            ['pts1', 1],
            ['pts2', 1],
        ]) // Mock file entries
        fsStatStub.onFirstCall().resolves({ mtime: new Date(recentTime) })
        fsWriteFileStub.resolves()

        await utils.checkTerminalActivity(idleFilePath)

        // Verify that fs.writeFile was called (which means updateIdleFile was called)
        assert.strictEqual(fsWriteFileStub.callCount, 1)
        assert.strictEqual(fsWriteFileStub.firstCall.args[0], idleFilePath)

        // Verify the timestamp is a valid ISO string
        const timestamp = fsWriteFileStub.firstCall.args[1]
        assert.strictEqual(typeof timestamp, 'string')
        assert.ok(!isNaN(Date.parse(timestamp)))
    })

    it('should stop checking once activity is detected', async function () {
        const idleFilePath = '/tmp/test-idle-file'
        const recentTime = Date.now() - ActivityCheckInterval / 2

        fsReaddirStub.resolves([
            ['pts1', 1],
            ['pts2', 1],
            ['pts3', 1],
        ])
        fsStatStub.onFirstCall().resolves({ mtime: new Date(recentTime) }) // First file has activity
        fsWriteFileStub.resolves()

        await utils.checkTerminalActivity(idleFilePath)

        // Should only call stat once since activity was detected on first file
        assert.strictEqual(fsStatStub.callCount, 1)
        // Should write to file once
        assert.strictEqual(fsWriteFileStub.callCount, 1)
    })

    it('should handle stat error gracefully and continue checking other files', async function () {
        const idleFilePath = '/tmp/test-idle-file'
        const recentTime = Date.now() - ActivityCheckInterval / 2
        const statError = new Error('File not found')

        fsReaddirStub.resolves([
            ['pts1', 1],
            ['pts2', 1],
        ])
        fsStatStub.onFirstCall().rejects(statError) // First file fails
        fsStatStub.onSecondCall().resolves({ mtime: new Date(recentTime) }) // Second file succeeds
        fsWriteFileStub.resolves()

        await utils.checkTerminalActivity(idleFilePath)

        // Should continue and find activity on second file
        assert.strictEqual(fsStatStub.callCount, 2)
        assert.strictEqual(fsWriteFileStub.callCount, 1)
    })
})

describe('promptAndApplyExplorerFilter', function () {
    let executeCommandStub: sinon.SinonStub
    let saveSelection: sinon.SinonStub
    const node = { label: 'test-node' } as any

    const items = [
        { label: 'a', key: 'k-a' },
        { label: 'b', key: 'k-b' },
    ]

    beforeEach(function () {
        executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves()
        saveSelection = sinon.stub()
    })

    afterEach(function () {
        sinon.restore()
    })

    it('shows the items and placeholder in the QuickPick', async function () {
        let seenItems: readonly vscode.QuickPickItem[] = []
        let seenPlaceholder: string | undefined
        getTestWindow().onDidShowQuickPick((picker) => {
            seenItems = picker.items
            seenPlaceholder = picker.placeholder
            picker.dispose()
        })

        await utils.promptAndApplyExplorerFilter(node, items, 'pick something', new Set(), saveSelection)

        assert.deepStrictEqual(
            seenItems.map((i) => i.label),
            ['a', 'b']
        )
        assert.strictEqual(seenPlaceholder, 'pick something')
    })

    it('does nothing when the user cancels', async function () {
        getTestWindow().onDidShowQuickPick((picker) => picker.dispose())

        await utils.promptAndApplyExplorerFilter(node, items, 'p', new Set(['k-a']), saveSelection)

        assert.strictEqual(saveSelection.callCount, 0, 'Cancel must not persist a selection')
        assert.strictEqual(executeCommandStub.callCount, 0, 'Cancel must not refresh the tree')
    })

    it('saves and refreshes when the selection grows', async function () {
        getTestWindow().onDidShowQuickPick((picker) => picker.acceptItems(...picker.items))

        await utils.promptAndApplyExplorerFilter(node, items, 'p', new Set(['k-a']), saveSelection)

        assert.deepStrictEqual(saveSelection.firstCall.args[0], ['k-a', 'k-b'])
        assert.ok(executeCommandStub.calledOnceWith('aws.refreshAwsExplorerNode', node))
    })

    it('saves and refreshes when the selection shrinks', async function () {
        getTestWindow().onDidShowQuickPick((picker) => picker.acceptItems(picker.items[0]))

        await utils.promptAndApplyExplorerFilter(node, items, 'p', new Set(['k-a', 'k-b']), saveSelection)

        assert.deepStrictEqual(saveSelection.firstCall.args[0], ['k-a'])
        assert.strictEqual(executeCommandStub.callCount, 1)
    })

    it('saves and refreshes when the selection swaps a key but keeps the same size', async function () {
        getTestWindow().onDidShowQuickPick((picker) => picker.acceptItems(picker.items[1]))

        await utils.promptAndApplyExplorerFilter(node, items, 'p', new Set(['k-a']), saveSelection)

        assert.deepStrictEqual(saveSelection.firstCall.args[0], ['k-b'])
        assert.strictEqual(executeCommandStub.callCount, 1, 'Same-size but different keys is still a change')
    })

    it('does not save or refresh when the selection is unchanged', async function () {
        getTestWindow().onDidShowQuickPick((picker) => picker.acceptItems(...picker.items))

        await utils.promptAndApplyExplorerFilter(node, items, 'p', new Set(['k-a', 'k-b']), saveSelection)

        assert.strictEqual(saveSelection.callCount, 0, 'Unchanged selection must not be persisted')
        assert.strictEqual(executeCommandStub.callCount, 0, 'Unchanged selection must not refresh the tree')
    })
})
