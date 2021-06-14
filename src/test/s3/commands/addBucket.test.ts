/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { addBucketCommand } from '../../../s3/commands/addBucket'
import { S3Node } from '../../../s3/explorer/s3Nodes'
import { S3Client } from '../../../shared/clients/s3Client'
import { FakeCommands } from '../../shared/vscode/fakeCommands'
import { FakeWindow } from '../../shared/vscode/fakeWindow'
import { anything, mock, instance, when, deepEqual, verify } from '../../utilities/mockito'

describe('addBucketCommand', function () {
    const bucketName = 'buc.ket-n4.m3'
    const region = 'region'
    let s3: S3Client
    let node: S3Node

    beforeEach(function () {
        s3 = mock()
        node = new S3Node(instance(s3), region)
    })

    it('prompts for bucket name, creates bucket, shows success, and refreshes node', async function () {
        when(s3.listFiles(deepEqual({ bucketName }))).thenResolve({
            files: [],
            folders: [],
        })

        const window = new FakeWindow({ inputBox: { input: bucketName } })
        const commands = new FakeCommands()
        await addBucketCommand(node, window, commands)

        assert.strictEqual(window.inputBox.options?.prompt, 'Enter an existing bucket name')
        assert.strictEqual(window.inputBox.options?.placeHolder, 'Bucket Name')

        assert.strictEqual(window.message.information, 'Added bucket: buc.ket-n4.m3')

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [node])
    })

    it('does nothing when prompt is cancelled', async function () {
        await addBucketCommand(node, new FakeWindow(), new FakeCommands())

        verify(s3.createFolder(anything())).never()
    })

    it('shows an error message and does nothing when adding fails', async function () {
        when(s3.listFiles(anything())).thenReject(new Error('Expected failure'))

        const window = new FakeWindow({ inputBox: { input: bucketName } })
        const commands = new FakeCommands()
        await addBucketCommand(node, window, commands)

        assert.ok(window.message.error?.includes('Failed to add bucket'))

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [node])
    })

    it('warns when bucket name is invalid', async function () {
        const window = new FakeWindow({ inputBox: { input: 'gg' } })
        const commands = new FakeCommands()
        await addBucketCommand(node, window, commands)

        assert.strictEqual(window.inputBox.errorMessage, 'Bucket name must be between 3 and 63 characters long')
    })
})
