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
import { FakeWindow } from '../../shared/vscode/fakeWindow'
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
            bucket: { name: bucketName, region: 'region', arn: 'arn', uri: 's3://foo' },
        })

        const window = new FakeWindow({ inputBox: { input: bucketName } })
        const commands = new FakeCommands()
        await createBucketCommand(node, window, commands)

        assert.strictEqual(window.inputBox.options?.prompt, 'Enter a new bucket name')
        assert.strictEqual(window.inputBox.options?.placeHolder, 'Bucket Name')

        assert.strictEqual(window.message.information, 'Created bucket: buc.ket-n4.m3')

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [node])
    })

    it('does nothing when prompt is cancelled', async function () {
        await assert.rejects(() => createBucketCommand(node, new FakeWindow(), new FakeCommands()), CancellationError)

        verify(s3.createFolder(anything())).never()
    })

    it('throws an error and refreshes node when bucket creation fails', async function () {
        when(s3.createBucket(anything())).thenReject(new Error('Expected failure'))

        const window = new FakeWindow({ inputBox: { input: bucketName } })
        const commands = new FakeCommands()
        await assert.rejects(() => createBucketCommand(node, window, commands), /Failed to create bucket/)

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [node])
    })
})
