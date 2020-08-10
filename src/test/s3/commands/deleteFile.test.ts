/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { deleteFileCommand } from '../../../s3/commands/deleteFile'
import { S3BucketNode } from '../../../s3/explorer/s3BucketNode'
import { S3FileNode } from '../../../s3/explorer/s3FileNode'
import { S3Node } from '../../../s3/explorer/s3Nodes'
import { Bucket, S3Client } from '../../../shared/clients/s3Client'
import { FakeCommands } from '../../shared/vscode/fakeCommands'
import { FakeWindow } from '../../shared/vscode/fakeWindow'
import { anything, mock, instance, when, deepEqual, verify } from '../../utilities/mockito'

describe('deleteFileCommand', () => {
    const key = 'foo/bar.jpg'
    const name = 'bar.jpg'
    const bucketName = 'bucket-name'
    const bucket: Bucket = { name: bucketName, region: 'region', arn: 'arn' }

    let s3: S3Client
    let parentNode: S3BucketNode
    let node: S3FileNode

    beforeEach(() => {
        s3 = mock()
        parentNode = new S3BucketNode(bucket, {} as S3Node, instance(s3))
        node = new S3FileNode(bucket, { name, key, arn: 'arn' }, parentNode, instance(s3))
    })

    it('confirms deletion, deletes file, shows status bar confirmation, and refreshes parent node', async () => {
        const window = new FakeWindow({ message: { warningSelection: 'Delete' } })
        const commands = new FakeCommands()
        await deleteFileCommand(node, window, commands)

        assert.strictEqual(window.message.warning, 'Are you sure you want to delete file s3://bucket-name/foo/bar.jpg?')

        verify(s3.deleteObject(deepEqual({ bucketName, key }))).once()

        assert.strictEqual(window.statusBar.message, '$(trash) Deleted bar.jpg')

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [parentNode])
    })

    it('does nothing when deletion is cancelled', async () => {
        const window = new FakeWindow({ message: { warningSelection: 'Cancel' } })
        const commands = new FakeCommands()
        await deleteFileCommand(node, window, commands)

        verify(s3.deleteObject(anything())).never()
        assert.strictEqual(window.statusBar.message, undefined)
        assert.strictEqual(window.message.error, undefined)
        assert.strictEqual(commands.command, undefined)
    })

    it('shows an error message and refreshes node when file deletion fails', async () => {
        when(s3.deleteObject(anything())).thenReject(new Error('Expected failure'))

        const window = new FakeWindow({ message: { warningSelection: 'Delete' } })
        const commands = new FakeCommands()
        await deleteFileCommand(node, window, commands)

        assert.ok(window.message.error?.startsWith('Failed to delete file bar.jpg'))

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [parentNode])
    })
})
