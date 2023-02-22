/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import * as path from 'path'
import { downloadFileAsCommand } from '../../../s3/commands/downloadFileAs'
import { S3BucketNode } from '../../../s3/explorer/s3BucketNode'
import { S3FileNode } from '../../../s3/explorer/s3FileNode'
import { S3Node } from '../../../s3/explorer/s3Nodes'
import { Bucket, S3Client } from '../../../shared/clients/s3Client'
import { bufferToStream } from '../../../shared/utilities/streamUtilities'
import { MockOutputChannel } from '../../mockOutputChannel'
import { anything, mock, instance, when, verify } from '../../utilities/mockito'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import globals from '../../../shared/extensionGlobals'
import { getTestWindow } from '../../shared/vscode/window'

describe('downloadFileAsCommand', function () {
    const bucketName = 'bucket-name'
    const key = 'path/to/file.jpg'
    const fileName = 'file.jpg'
    const lastModified = new Date(2020, 5, 4)
    const sizeBytes = 16

    let s3: S3Client
    let temp: string
    let saveLocation: vscode.Uri
    let bucketNode: S3BucketNode
    let node: S3FileNode

    before(async function () {
        // TODO: write separate test code for the progress report behavior
        temp = await makeTemporaryToolkitFolder()
        saveLocation = vscode.Uri.file(path.join(temp, 'file.jpg'))
    })

    beforeEach(function () {
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

    it('prompts for save location, downloads file with progress, and shows output channel', async function () {
        getTestWindow().onDidShowDialog(dialog => {
            assert.deepStrictEqual(dialog.filters, { 'All Files': ['*'], '*.jpg': ['jpg'] })
            assert.strictEqual(dialog.acceptButtonLabel, 'Download')
            dialog.accept()
        })
        const outputChannel = new MockOutputChannel()
        globals.context.globalState.update('aws.downloadPath', temp)

        when(s3.downloadFileStream(anything(), anything())).thenResolve(bufferToStream(Buffer.alloc(16)))

        await downloadFileAsCommand(node, outputChannel)

        assert.deepStrictEqual(outputChannel.lines, [
            `Downloading "s3://bucket-name/path/to/file.jpg" to: ${saveLocation}`,
            `Downloaded: ${saveLocation}`,
        ])
        assert.strictEqual(outputChannel.isShown, true)
        assert.strictEqual(outputChannel.isFocused, false)
    })

    it('does nothing when prompt is cancelled', async function () {
        getTestWindow().onDidShowDialog(d => d.close())
        await assert.rejects(() => downloadFileAsCommand(node), /cancelled/i)

        verify(s3.downloadFileStream(anything(), anything())).never()
    })

    it('throws when download fails', async function () {
        getTestWindow().onDidShowDialog(d => d.selectItem(saveLocation))
        when(s3.downloadFileStream(anything(), anything())).thenReject(new Error('Expected failure'))

        await assert.rejects(() => downloadFileAsCommand(node, new MockOutputChannel()), /Failed to download/)
    })
})
