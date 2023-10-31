/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { deleteBucketCommand } from '../../../s3/commands/deleteBucket'
import { S3BucketNode } from '../../../s3/explorer/s3BucketNode'
import { S3Node } from '../../../s3/explorer/s3Nodes'
import { S3Client } from '../../../shared/clients/s3Client'
import { assertNoErrorMessages, getTestWindow } from '../../shared/vscode/window'
import { anything, mock, instance, when, deepEqual, verify } from '../../utilities/mockito'

describe('deleteBucketCommand', function () {
    const bucketName = 'bucket-name'

    let s3: S3Client
    let parentNode: S3Node
    let node: S3BucketNode
    let sandbox: sinon.SinonSandbox
    let spyExecuteCommand: sinon.SinonSpy

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        spyExecuteCommand = sandbox.spy(vscode.commands, 'executeCommand')

        s3 = mock()
        parentNode = new S3Node(instance(s3))
        node = new S3BucketNode({ name: bucketName, region: 'region', arn: 'arn' }, parentNode, instance(s3))
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('confirms deletion, deletes bucket, shows progress bar, and refreshes parent node', async function () {
        getTestWindow().onDidShowInputBox(input => {
            assert.strictEqual(input.prompt, 'Enter bucket-name to confirm deletion')
            assert.strictEqual(input.placeholder, bucketName)
            input.acceptValue(bucketName)
        })
        await deleteBucketCommand(node)

        verify(s3.deleteBucket(deepEqual({ bucketName }))).once()

        getTestWindow().getFirstMessage().assertProgress('Deleting bucket-name...')

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', parentNode)
    })

    it('does nothing when deletion is cancelled', async function () {
        getTestWindow().onDidShowInputBox(input => input.hide())
        await assert.rejects(() => deleteBucketCommand(node), /cancelled/i)

        verify(s3.deleteBucket(anything())).never()

        assertNoErrorMessages()
        sandbox.assert.notCalled(spyExecuteCommand)
    })

    it('shows an error message and refreshes node when bucket deletion fails', async function () {
        when(s3.deleteBucket(anything())).thenReject(new Error('Expected failure'))

        getTestWindow().onDidShowInputBox(input => input.acceptValue(bucketName))
        await assert.rejects(() => deleteBucketCommand(node), /failed to delete bucket bucket-name/i)

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', parentNode)
    })

    it('warns when confirmation is invalid', async function () {
        getTestWindow().onDidShowInputBox(input => {
            input.acceptValue('something other than the bucket name')
            assert.strictEqual(input.validationMessage, 'Enter bucket-name to confirm deletion')
            input.hide()
        })
        await assert.rejects(() => deleteBucketCommand(node))
    })
})
