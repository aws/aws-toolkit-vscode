/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { FileSizeBytes, uploadFileCommand } from '../../../s3/commands/uploadFile'
import { S3BucketNode } from '../../../s3/explorer/s3BucketNode'
import { S3Node } from '../../../s3/explorer/s3Nodes'
import { S3Client } from '../../../shared/clients/s3Client'
import { MockOutputChannel } from '../../mockOutputChannel'
import { FakeCommands } from '../../shared/vscode/fakeCommands'
import { FakeWindow } from '../../shared/vscode/fakeWindow'
import { anything, mock, instance, when, capture, verify } from '../../utilities/mockito'

describe('uploadFileCommand', () => {
    const bucketName = 'bucket-name'
    const key = 'file.jpg'
    const sizeBytes = 16
    const fileLocation = vscode.Uri.file('/file.jpg')
    const statFile: FileSizeBytes = _file => sizeBytes

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

    it('prompts for file location, uploads file with progress, shows output channel, and refreshes node', async () => {
        when(s3.uploadFile(anything())).thenResolve()

        const window = new FakeWindow({ dialog: { openSelections: [fileLocation] } })
        const commands = new FakeCommands()
        const outputChannel = new MockOutputChannel()
        await uploadFileCommand(node, statFile, window, commands, outputChannel)

        // eslint-disable-next-line @typescript-eslint/unbound-method
        const [uploadFileRequest] = capture(s3.uploadFile).last()

        assert.strictEqual(window.dialog.openOptions?.openLabel, 'Upload')

        assert.strictEqual(uploadFileRequest.bucketName, bucketName)
        assert.strictEqual(uploadFileRequest.key, key)
        assert.strictEqual(uploadFileRequest.fileLocation, fileLocation)

        uploadFileRequest.progressListener!(4) // +25% (+4/16)

        assert.deepStrictEqual(window.progress.reported, [{ increment: 25 }])
        assert.strictEqual(window.progress.options?.location, vscode.ProgressLocation.Notification)
        assert.strictEqual(window.progress.options?.title, 'Uploading file.jpg...')

        assert.deepStrictEqual(outputChannel.lines, [
            `Uploading file from ${fileLocation} to s3://bucket-name/file.jpg`,
            `Successfully uploaded file s3://bucket-name/file.jpg`,
        ])
        assert.strictEqual(outputChannel.isShown, true)
        assert.strictEqual(outputChannel.isFocused, false)

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [node])
    })

    it('does nothing when prompt is cancelled', async () => {
        await uploadFileCommand(node, statFile, new FakeWindow(), new FakeCommands())

        verify(s3.uploadFile(anything())).never()
    })

    it('shows an error message when upload fails', async () => {
        when(s3.uploadFile(anything())).thenReject(new Error('Expected failure'))

        const window = new FakeWindow({ dialog: { openSelections: [fileLocation] } })
        const commands = new FakeCommands()
        await uploadFileCommand(node, statFile, window, commands)

        assert.ok(window.message.error?.includes('Failed to upload file'))

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [node])
    })
})
