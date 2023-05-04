/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { createBucketCommand } from '../../../s3/commands/createBucket'
import { S3Node } from '../../../s3/explorer/s3Nodes'
import { S3Client } from '../../../shared/clients/s3Client'
import { CancellationError } from '../../../shared/utilities/timeoutUtils'
import { FakeCommands } from '../../shared/vscode/fakeCommands'
import { getTestWindow } from '../../shared/vscode/window'
import { anything, mock, instance, when, deepEqual, verify } from '../../utilities/mockito'

describe('createBucketCommand', function () {
    const bucketName = 'buc.ket-n4.m3'
    let s3: S3Client
    let node: S3Node

    beforeEach(function () {
        s3 = mock()
        node = new S3Node(instance(s3))
    })

    it('prompts for bucket name, creates bucket, shows success, and refreshes node', async function () {
        when(s3.createBucket(deepEqual({ bucketName }))).thenResolve({
            bucket: { name: bucketName, region: 'region', arn: 'arn' },
        })

        getTestWindow().onDidShowInputBox(input => {
            assert.strictEqual(input.prompt, 'Enter a new bucket name')
            assert.strictEqual(input.placeholder, 'Bucket Name')
            input.acceptValue(bucketName)
        })
        const commands = new FakeCommands()
        await createBucketCommand(node, commands)

        getTestWindow()
            .getFirstMessage()
            .assertInfo(/Created bucket: buc.ket-n4.m3/)

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [node])
    })

    it('does nothing when prompt is cancelled', async function () {
        getTestWindow().onDidShowInputBox(input => input.hide())
        await assert.rejects(() => createBucketCommand(node, new FakeCommands()), CancellationError)

        verify(s3.createFolder(anything())).never()
    })

    it('throws an error and refreshes node when bucket creation fails', async function () {
        when(s3.createBucket(anything())).thenReject(new Error('Expected failure'))

        getTestWindow().onDidShowInputBox(input => input.acceptValue(bucketName))
        const commands = new FakeCommands()
        await assert.rejects(() => createBucketCommand(node, commands), /Failed to create bucket/)

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [node])
    })
})
