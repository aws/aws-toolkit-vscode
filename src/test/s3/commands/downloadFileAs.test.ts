/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { downloadFileAsCommand } from '../../../s3/commands/downloadFileAs'
import { S3FileNode } from '../../../s3/explorer/s3FileNode'
import { S3Client, S3Error } from '../../../shared/clients/s3Client'
import { FakeWindow } from '../../shared/vscode/fakeWindow'
import { anything, mock, instance, when, capture, verify } from '../../utilities/mockito'

describe('downloadFileAsCommand', () => {
    const bucketName = 'bucket-name'
    const key = 'path/to/file.jpg'
    const fileName = 'file.jpg'
    const lastModified = new Date(2020, 5, 4)
    const sizeBytes = 16
    const saveLocation = vscode.Uri.file('/file.jpg')
    const defaultSaveLocation = vscode.Uri.file('file.jpg')

    let s3: S3Client
    let node: S3FileNode

    beforeEach(() => {
        s3 = mock()
        node = new S3FileNode(
            { name: bucketName, region: 'region', arn: 'arn' },
            { name: fileName, key: key, arn: 'arn', lastModified, sizeBytes },
            instance(s3)
        )
    })

    it('prompts for save location, downloads file, and show progress', async () => {
        when(s3.downloadFile(anything())).thenResolve()

        const window = new FakeWindow({ dialog: { saveSelection: saveLocation } })
        await downloadFileAsCommand(node, window)

        const [downloadFileRequest] = capture(s3.downloadFile).last()

        assert.deepStrictEqual(window.dialog.saveOptions?.defaultUri, defaultSaveLocation)
        assert.strictEqual(window.dialog.saveOptions?.saveLabel, 'Download')
        assert.deepStrictEqual(window.dialog.saveOptions?.filters, { 'All files': ['*'], '*.jpg': ['.jpg'] })

        assert.strictEqual(downloadFileRequest.bucketName, bucketName)
        assert.strictEqual(downloadFileRequest.key, key)
        assert.strictEqual(downloadFileRequest.saveLocation, saveLocation)

        reportProgression(downloadFileRequest.progressListener!, [4, 8, 16]) // +25% (4/16), +25% (4/16), +50% (8/16)

        assert.deepStrictEqual(window.progress.reported, incrementalPercentages([25, 25, 50]))
        assert.strictEqual(window.progress.options?.location, vscode.ProgressLocation.Notification)
        assert.strictEqual(window.progress.options?.title, 'Downloading file.jpg...')
    })

    it('does nothing when prompt is cancelled', async () => {
        await downloadFileAsCommand(node, new FakeWindow())

        verify(s3.downloadFile(anything())).never()
    })

    it('shows an error message when download fails', async () => {
        when(s3.downloadFile(anything())).thenReject(new S3Error('Expected failure'))

        const window = new FakeWindow({ dialog: { saveSelection: saveLocation } })
        await downloadFileAsCommand(node, window)

        assert.ok(window.message.error?.includes('Failed to download file'))
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
