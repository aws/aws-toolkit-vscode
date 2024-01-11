/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { createBucketCommand } from '../../../s3/commands/createBucket'
import { S3Node } from '../../../s3/explorer/s3Nodes'
import { S3Client } from '../../../shared/clients/s3Client'
import { CancellationError } from '../../../shared/utilities/timeoutUtils'
import { getTestWindow } from '../../shared/vscode/window'

describe('createBucketCommand', function () {
    const bucketName = 'buc.ket-n4.m3'
    let s3: S3Client
    let node: S3Node
    let sandbox: sinon.SinonSandbox
    let spyExecuteCommand: sinon.SinonSpy

    beforeEach(function () {
        sandbox = sinon.createSandbox()
        spyExecuteCommand = sandbox.spy(vscode.commands, 'executeCommand')

        s3 = {} as any as S3Client
        node = new S3Node(s3)
    })

    afterEach(function () {
        sandbox.restore()
    })

    it('prompts for bucket name, creates bucket, shows success, and refreshes node', async function () {
        const stub = sinon.stub().resolves({
            bucket: { name: bucketName, region: 'region', arn: 'arn' },
        })
        s3.createBucket = stub

        getTestWindow().onDidShowInputBox(input => {
            assert.strictEqual(input.prompt, 'Enter a new bucket name')
            assert.strictEqual(input.placeholder, 'Bucket Name')
            input.acceptValue(bucketName)
        })
        await createBucketCommand(node)

        getTestWindow()
            .getFirstMessage()
            .assertInfo(/Created bucket: buc.ket-n4.m3/)

        assert(stub.calledOnceWithExactly({ bucketName }))
        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', node)
    })

    it('does nothing when prompt is cancelled', async function () {
        const stub = sinon.stub()
        s3.createBucket = stub
        getTestWindow().onDidShowInputBox(input => input.hide())
        await assert.rejects(() => createBucketCommand(node), CancellationError)

        assert(stub.notCalled)
    })

    it('throws an error and refreshes node when bucket creation fails', async function () {
        const stub = sinon.stub().rejects()
        s3.createBucket = stub

        getTestWindow().onDidShowInputBox(input => input.acceptValue(bucketName))
        await assert.rejects(() => createBucketCommand(node), /Failed to create bucket/)

        sandbox.assert.calledWith(spyExecuteCommand, 'aws.refreshAwsExplorerNode', node)
    })
})
