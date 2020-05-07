/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { createBucketCommand } from '../../../s3/commands/createBucket'
import { S3Node } from '../../../s3/explorer/s3Nodes'
import { S3Client, S3Error } from '../../../shared/clients/s3Client'
import { FakeCommands } from '../../shared/vscode/fakeCommands'
import { FakeWindow } from '../../shared/vscode/fakeWindow'
import { anything, mock, instance, when, deepEqual, verify } from '../../utilities/mockito'

describe('createBucketCommand', () => {
    const invalidBucketNames: { bucketName: string; error: string }[] = [
        { bucketName: 'aa', error: 'Bucket name must be between 3 and 63 characters long' },
        { bucketName: 'a'.repeat(64), error: 'Bucket name must be between 3 and 63 characters long' },
        { bucketName: '-bucket', error: 'Bucket name must start with a lowercase letter or number' },
        { bucketName: 'bucket-', error: 'Bucket name must end with a lowercase letter or number' },
        {
            bucketName: 'buck~et',
            error: 'Bucket name must only contain lowercase letters, numbers, hyphens, and periods',
        },
        { bucketName: 'buck..et', error: 'Periods in bucket name must be surrounded by a lowercase letter or number' },
        { bucketName: '127.0.0.1', error: 'Bucket name must not resemble an IP address' },
    ]

    const bucketName = 'buc.ket-n4.m3'
    let s3: S3Client
    let node: S3Node

    beforeEach(() => {
        s3 = mock()
        node = new S3Node(instance(s3))
    })

    it('prompts for bucket name, creates bucket, and refreshes node', async () => {
        when(s3.createBucket(deepEqual({ bucketName }))).thenResolve({
            bucket: { name: bucketName, region: 'region', arn: 'arn' },
        })

        const window = new FakeWindow({ inputBox: { input: bucketName } })
        const commands = new FakeCommands()
        await createBucketCommand(node, window, commands)

        assert.strictEqual(window.inputBox.options?.prompt, 'Create Bucket')
        assert.strictEqual(window.inputBox.options?.placeHolder, 'Bucket Name')

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [node])
    })

    it('does nothing when prompt is cancelled', async () => {
        await createBucketCommand(node, new FakeWindow(), new FakeCommands())

        verify(s3.createFolder(anything())).never()
    })

    it('shows an error message and refreshes node when bucket creation fails', async () => {
        when(s3.createBucket(anything())).thenReject(new S3Error('Expected failure'))

        const window = new FakeWindow({ inputBox: { input: bucketName } })
        const commands = new FakeCommands()
        await createBucketCommand(node, window, commands)

        assert.ok(window.message.error?.includes('Failed to create bucket'))

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [node])
    })

    invalidBucketNames.forEach(invalid => {
        it(`warns '${invalid.error}' when bucket name is '${invalid.bucketName}'`, async () => {
            const window = new FakeWindow({ inputBox: { input: invalid.bucketName } })
            const commands = new FakeCommands()
            await createBucketCommand(node, window, commands)

            assert.strictEqual(window.inputBox.errorMessage, invalid.error)
        })
    })
})
