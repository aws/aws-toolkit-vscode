/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { createFolderCommand } from '../../../s3/commands/createFolder'
import { S3BucketNode } from '../../../s3/explorer/s3BucketNode'
import { S3Node } from '../../../s3/explorer/s3Nodes'
import { S3Client } from '../../../shared/clients/s3Client'
import { FakeCommands } from '../../shared/vscode/fakeCommands'
import { FakeWindow } from '../../shared/vscode/fakeWindow'
import { anything, mock, instance, when, deepEqual, verify } from '../../utilities/mockito'

describe('createFolderCommand', () => {
    const invalidFolderNames: { folderName: string; error: string }[] = [
        { folderName: 'contains/delimiter', error: `Folder name must not contain '/'` },
        { folderName: '', error: 'Folder name must not be empty' },
    ]

    const folderName = 'foo'
    const folderPath = 'foo/'
    const bucketName = 'bucket-name'

    let s3: S3Client
    let node: S3BucketNode

    beforeEach(() => {
        s3 = mock()
        node = new S3BucketNode(
            { name: bucketName, region: 'region', arn: 'arn' },
            new S3Node(instance(s3)),
            instance(s3)
        )
    })

    it('prompts for folder name, creates folder, shows success, and refreshes node', async () => {
        when(s3.createFolder(deepEqual({ path: folderPath, bucketName }))).thenResolve({
            folder: { name: folderName, path: folderPath, arn: 'arn' },
        })

        const window = new FakeWindow({ inputBox: { input: folderName } })
        const commands = new FakeCommands()
        await createFolderCommand(node, window, commands)

        assert.strictEqual(window.inputBox.options?.prompt, 'Enter a folder to create in s3://bucket-name')
        assert.strictEqual(window.inputBox.options?.placeHolder, 'Folder Name')

        assert.strictEqual(window.message.information, 'Created folder foo')

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [node])
    })

    it('does nothing when prompt is cancelled', async () => {
        await createFolderCommand(node, new FakeWindow(), new FakeCommands())

        verify(s3.createFolder(anything())).never()
    })

    it('shows an error message and refreshes node when folder creation fails', async () => {
        when(s3.createFolder(anything())).thenReject(new Error('Expected failure'))

        const window = new FakeWindow({ inputBox: { input: folderName } })
        const commands = new FakeCommands()
        await createFolderCommand(node, window, commands)

        assert.ok(window.message.error?.includes('Failed to create folder'))

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [node])
    })

    invalidFolderNames.forEach(invalid => {
        it(`warns '${invalid.error}' when folder name is '${invalid.folderName}'`, async () => {
            const window = new FakeWindow({ inputBox: { input: invalid.folderName } })
            const commands = new FakeCommands()
            await createFolderCommand(node, window, commands)

            assert.strictEqual(window.inputBox.errorMessage, invalid.error)
        })
    })
})
