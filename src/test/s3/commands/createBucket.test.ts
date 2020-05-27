/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { createBucketCommand } from '../../../s3/commands/createBucket'
import { S3Node } from '../../../s3/explorer/s3Nodes'
import { S3Client } from '../../../shared/clients/s3Client'
import { FakeCommands } from '../../shared/vscode/fakeCommands'
import { FakeWindow } from '../../shared/vscode/fakeWindow'
import { anything, mock, instance, when, deepEqual, verify } from '../../utilities/mockito'

describe('createBucketCommand', () => {
    const bucketName = 'buc.ket-n4.m3'
    let s3: S3Client
    let node: S3Node

    beforeEach(() => {
        s3 = mock()
        node = new S3Node(instance(s3))
    })

    it('prompts for bucket name, creates bucket, shows success, and refreshes node', async () => {
        when(s3.createBucket(deepEqual({ bucketName }))).thenResolve({
            bucket: { name: bucketName, region: 'region', arn: 'arn' },
        })

        const window = new FakeWindow({ inputBox: { input: bucketName } })
        const commands = new FakeCommands()
        await createBucketCommand(node, window, commands)

        assert.strictEqual(window.inputBox.options?.prompt, 'Enter a new bucket name')
        assert.strictEqual(window.inputBox.options?.placeHolder, 'Bucket Name')

        assert.strictEqual(window.message.information, 'Created bucket buc.ket-n4.m3')

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [node])
    })

    it('does nothing when prompt is cancelled', async () => {
        await createBucketCommand(node, new FakeWindow(), new FakeCommands())

        verify(s3.createFolder(anything())).never()
    })

    it('shows an error message and refreshes node when bucket creation fails', async () => {
        when(s3.createBucket(anything())).thenReject(new Error('Expected failure'))

        const window = new FakeWindow({ inputBox: { input: bucketName } })
        const commands = new FakeCommands()
        await createBucketCommand(node, window, commands)

        assert.ok(window.message.error?.includes('Failed to create bucket'))

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [node])
    })

    it('warns when bucket name is invalid', async () => {
        const window = new FakeWindow({ inputBox: { input: 'gg' } })
        const commands = new FakeCommands()
        await createBucketCommand(node, window, commands)

        assert.strictEqual(window.inputBox.errorMessage, 'Bucket name must be between 3 and 63 characters long')
    })
})
