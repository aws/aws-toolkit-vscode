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

        s3 = {} as any as S3Client
        parentNode = new S3BucketNode(bucket, {} as S3Node, s3)
        node = new S3FileNode(bucket, { name, key, arn: 'arn' }, parentNode, s3)
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('confirms deletion, deletes file, shows status bar confirmation, and refreshes parent node', async function () {
        getTestWindow().onDidShowMessage(m => m.selectItem('Delete'))
        const stub = sinon.stub()
        s3.deleteObject = stub
        await deleteFileCommand(node)

        getTestWindow()
            .getFirstMessage()
            .assertWarn('Are you sure you want to delete file s3://bucket-name/foo/bar.jpg?')

        assert(stub.calledOnceWithExactly({ bucketName, key }))

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', parentNode)
    })

    it('does nothing when deletion is cancelled', async function () {
        getTestWindow().onDidShowMessage(m => m.selectItem('Cancel'))
        const stub = sinon.stub()
        s3.deleteObject = stub
        await assert.rejects(() => deleteFileCommand(node), /cancelled/i)

        assert(stub.notCalled)
        assert.deepStrictEqual(getTestWindow().statusBar.messages, [])
        assertNoErrorMessages()
        sandbox.assert.notCalled(spyExecuteCommand)
    })

    it('shows an error message and refreshes node when file deletion fails', async function () {
        const stub = sinon.stub().rejects(new Error('Expected failure'))
        s3.deleteObject = stub

        getTestWindow().onDidShowMessage(m => m.selectItem('Delete'))
        await assert.rejects(() => deleteFileCommand(node), /failed to delete file bar.jpg/i)

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', parentNode)
    })
})
