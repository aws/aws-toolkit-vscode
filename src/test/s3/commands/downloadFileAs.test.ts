/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { downloadFileAsCommand } from '../../../s3/commands/downloadFileAs'
import { S3BucketNode } from '../../../s3/explorer/s3BucketNode'
import { S3FileNode } from '../../../s3/explorer/s3FileNode'
import { S3Node } from '../../../s3/explorer/s3Nodes'
import { Bucket, S3Client } from '../../../shared/clients/s3Client'
import { MockOutputChannel } from '../../mockOutputChannel'
import { FakeWindow } from '../../shared/vscode/fakeWindow'
import { anything, mock, instance, when, capture, verify } from '../../utilities/mockito'

describe('downloadFileAsCommand', () => {
    const bucketName = 'bucket-name'
    const key = 'path/to/file.jpg'
    const fileName = 'file.jpg'
    const lastModified = new Date(2020, 5, 4)
    const sizeBytes = 16
    const saveLocation = vscode.Uri.file('/file.jpg')

    let s3: S3Client
    let bucketNode: S3BucketNode
    let node: S3FileNode

    beforeEach(() => {
        s3 = mock()

        const bucket: Bucket = { name: bucketName, region: 'region', arn: 'arn' }
        bucketNode = new S3BucketNode(bucket, {} as S3Node, instance(s3))
        node = new S3FileNode(
            bucket,
            { name: fileName, key: key, arn: 'arn', lastModified, sizeBytes },
            bucketNode,
            instance(s3)
        )
    })

    it('prompts for save location, downloads file with progress, and shows output channel', async () => {
        when(s3.downloadFile(anything())).thenResolve()

        const window = new FakeWindow({ dialog: { saveSelection: saveLocation } })
        const outputChannel = new MockOutputChannel()
        await downloadFileAsCommand(node, window, outputChannel)

        // eslint-disable-next-line @typescript-eslint/unbound-method
        const [downloadFileRequest] = capture(s3.downloadFile).last()

        assert.ok(window.dialog.saveOptions?.defaultUri?.path?.endsWith(fileName))
        assert.strictEqual(window.dialog.saveOptions?.saveLabel, 'Download')
        assert.deepStrictEqual(window.dialog.saveOptions?.filters, { 'All Files': ['*'], '*.jpg': ['jpg'] })

        assert.strictEqual(downloadFileRequest.bucketName, bucketName)
        assert.strictEqual(downloadFileRequest.key, key)
        assert.strictEqual(downloadFileRequest.saveLocation, saveLocation)

        downloadFileRequest.progressListener!(4) // +25% (+4/16)

        assert.deepStrictEqual(window.progress.reported, [{ increment: 25 }])
        assert.strictEqual(window.progress.options?.location, vscode.ProgressLocation.Notification)
        assert.strictEqual(window.progress.options?.title, 'Downloading file.jpg...')

        assert.deepStrictEqual(outputChannel.lines, [
            `Downloading file from s3://bucket-name/path/to/file.jpg to ${saveLocation}`,
            `Successfully downloaded file ${saveLocation}`,
        ])
        assert.strictEqual(outputChannel.isShown, true)
        assert.strictEqual(outputChannel.isFocused, false)
    })

    it('does nothing when prompt is cancelled', async () => {
        await downloadFileAsCommand(node, new FakeWindow())

        verify(s3.downloadFile(anything())).never()
    })

    it('shows an error message when download fails', async () => {
        when(s3.downloadFile(anything())).thenReject(new Error('Expected failure'))

        const window = new FakeWindow({ dialog: { saveSelection: saveLocation } })
        await downloadFileAsCommand(node, window)

        assert.ok(window.message.error?.includes('Failed to download file'))
    })
})
