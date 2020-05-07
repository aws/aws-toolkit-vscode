/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { FileSizeBytes, uploadFileCommand } from '../../../s3/commands/uploadFile'
import { S3BucketNode } from '../../../s3/explorer/s3BucketNode'
import { S3Client, S3Error } from '../../../shared/clients/s3Client'
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
        node = new S3BucketNode({ name: bucketName, region: 'region', arn: 'arn' }, instance(s3))
    })

    it('prompts for file location, uploads file, shows progress, and refreshes node', async () => {
        when(s3.uploadFile(anything())).thenResolve()

        const window = new FakeWindow({ dialog: { openSelections: [fileLocation] } })
        const commands = new FakeCommands()
        await uploadFileCommand(node, statFile, window, commands)

        const [uploadFileRequest] = capture(s3.uploadFile).last()

        assert.strictEqual(window.dialog.openOptions?.openLabel, 'Upload')

        assert.strictEqual(uploadFileRequest.bucketName, bucketName)
        assert.strictEqual(uploadFileRequest.key, key)
        assert.strictEqual(uploadFileRequest.fileLocation, fileLocation)

        reportProgression(uploadFileRequest.progressListener!, [4, 8, 16]) // +25% (4/16), +25% (4/16), +50% (8/16)

        assert.deepStrictEqual(window.progress.reported, incrementalPercentages([25, 25, 50]))
        assert.strictEqual(window.progress.options?.location, vscode.ProgressLocation.Notification)
        assert.strictEqual(window.progress.options?.title, 'Uploading file.jpg...')

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [node])
    })

    it('does nothing when prompt is cancelled', async () => {
        await uploadFileCommand(node, statFile, new FakeWindow(), new FakeCommands())

        verify(s3.uploadFile(anything())).never()
    })

    it('shows an error message when upload fails', async () => {
        when(s3.uploadFile(anything())).thenReject(new S3Error('Expected failure'))

        const window = new FakeWindow({ dialog: { openSelections: [fileLocation] } })
        const commands = new FakeCommands()
        await uploadFileCommand(node, statFile, window, commands)

        assert.ok(window.message.error?.includes('Failed to upload file'))

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [node])
    })
})

function reportProgression(progressListener: (loadedBytes: number) => void, totalByteProgression: number[]): void {
    totalByteProgression.forEach(total => progressListener(total))
}

function incrementalPercentages(increments: number[]) {
    return increments.map(increment => ({
        increment,
    }))
}
