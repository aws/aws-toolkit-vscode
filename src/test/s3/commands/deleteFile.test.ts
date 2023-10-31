/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { deleteFileCommand } from '../../../s3/commands/deleteFile'
import { S3BucketNode } from '../../../s3/explorer/s3BucketNode'
import { S3FileNode } from '../../../s3/explorer/s3FileNode'
import { S3Node } from '../../../s3/explorer/s3Nodes'
import { Bucket, S3Client } from '../../../shared/clients/s3Client'
import { assertNoErrorMessages, getTestWindow } from '../../shared/vscode/window'
import { anything, mock, instance, when, deepEqual, verify } from '../../utilities/mockito'

describe('deleteFileCommand', function () {
    const key = 'foo/bar.jpg'
    const name = 'bar.jpg'
    const bucketName = 'bucket-name'
    const bucket: Bucket = { name: bucketName, region: 'region', arn: 'arn' }

    let s3: S3Client
    let parentNode: S3BucketNode
    let node: S3FileNode
    let sandbox: sinon.SinonSandbox
    let spyExecuteCommand: sinon.SinonSpy

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        spyExecuteCommand = sandbox.spy(vscode.commands, 'executeCommand')

        s3 = mock()
        parentNode = new S3BucketNode(bucket, {} as S3Node, instance(s3))
        node = new S3FileNode(bucket, { name, key, arn: 'arn' }, parentNode, instance(s3))
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('confirms deletion, deletes file, shows status bar confirmation, and refreshes parent node', async function () {
        getTestWindow().onDidShowMessage(m => m.selectItem('Delete'))
        await deleteFileCommand(node)

        getTestWindow()
            .getFirstMessage()
            .assertWarn('Are you sure you want to delete file s3://bucket-name/foo/bar.jpg?')

        verify(s3.deleteObject(deepEqual({ bucketName, key }))).once()

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', parentNode)
    })

    it('does nothing when deletion is cancelled', async function () {
        getTestWindow().onDidShowMessage(m => m.selectItem('Cancel'))
        await assert.rejects(() => deleteFileCommand(node), /cancelled/i)

        verify(s3.deleteObject(anything())).never()
        assert.deepStrictEqual(getTestWindow().statusBar.messages, [])
        assertNoErrorMessages()
        sandbox.assert.notCalled(spyExecuteCommand)
    })

    it('shows an error message and refreshes node when file deletion fails', async function () {
        when(s3.deleteObject(anything())).thenReject(new Error('Expected failure'))

        getTestWindow().onDidShowMessage(m => m.selectItem('Delete'))
        await assert.rejects(() => deleteFileCommand(node), /failed to delete file bar.jpg/i)

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', parentNode)
    })
})
