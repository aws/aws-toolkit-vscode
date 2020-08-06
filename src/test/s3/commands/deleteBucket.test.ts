/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { deleteBucketCommand } from '../../../s3/commands/deleteBucket'
import { S3BucketNode } from '../../../s3/explorer/s3BucketNode'
import { S3Node } from '../../../s3/explorer/s3Nodes'
import { S3Client } from '../../../shared/clients/s3Client'
import { FakeCommands } from '../../shared/vscode/fakeCommands'
import { FakeWindow } from '../../shared/vscode/fakeWindow'
import { anything, mock, instance, when, deepEqual, verify } from '../../utilities/mockito'

describe('deleteBucketCommand', () => {
    const bucketName = 'bucket-name'

    let s3: S3Client
    let parentNode: S3Node
    let node: S3BucketNode

    beforeEach(() => {
        s3 = mock()
        parentNode = new S3Node(instance(s3))
        node = new S3BucketNode({ name: bucketName, region: 'region', arn: 'arn' }, parentNode, instance(s3))
    })

    it('confirms deletion, deletes bucket, shows progress bar, and refreshes parent node', async () => {
        const window = new FakeWindow({ inputBox: { input: bucketName } })
        const commands = new FakeCommands()
        await deleteBucketCommand(node, window, commands)

        assert.strictEqual(window.inputBox.options?.prompt, 'Enter bucket-name to confirm deletion')
        assert.strictEqual(window.inputBox.options?.placeHolder, bucketName)

        verify(s3.deleteBucket(deepEqual({ bucketName }))).once()

        assert.strictEqual(window.progress.options?.location, vscode.ProgressLocation.Notification)
        assert.strictEqual(window.progress.options?.title, 'Deleting bucket-name...')

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [parentNode])
    })

    it('does nothing when deletion is cancelled', async () => {
        const window = new FakeWindow()
        const commands = new FakeCommands()
        await deleteBucketCommand(node, window, commands)

        verify(s3.deleteBucket(anything())).never()

        assert.strictEqual(window.message.error, undefined)
        assert.strictEqual(commands.command, undefined)
    })

    it('shows an error message and refreshes node when bucket deletion fails', async () => {
        when(s3.deleteBucket(anything())).thenReject(new Error('Expected failure'))

        const window = new FakeWindow({ inputBox: { input: bucketName } })
        const commands = new FakeCommands()
        await deleteBucketCommand(node, window, commands)

        assert.ok(window.message.error?.startsWith('Failed to delete bucket bucket-name'))

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [parentNode])
    })

    it('warns when confirmation is invalid', async () => {
        const window = new FakeWindow({ inputBox: { input: 'something other than the bucket name' } })
        const commands = new FakeCommands()
        await deleteBucketCommand(node, window, commands)

        assert.strictEqual(window.inputBox.errorMessage, 'Enter bucket-name to confirm deletion')
    })
})
