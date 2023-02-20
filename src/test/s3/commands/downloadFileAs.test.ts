/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { downloadFilesCommand } from '../../../s3/commands/downloadFiles'
import { S3BucketNode } from '../../../s3/explorer/s3BucketNode'
import { S3FileNode } from '../../../s3/explorer/s3FileNode'
import { S3Node } from '../../../s3/explorer/s3Nodes'
import { Bucket, Folder, S3Client } from '../../../shared/clients/s3Client'
import { bufferToStream } from '../../../shared/utilities/streamUtilities'
import { MockOutputChannel } from '../../mockOutputChannel'
import { FakeWindow } from '../../shared/vscode/fakeWindow'
import { anything, mock, instance, when, verify } from '../../utilities/mockito'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import globals from '../../../shared/extensionGlobals'
import { S3FolderNode } from '../../../s3/explorer/s3FolderNode'

describe('downloadFilesCommand', function () {
    const bucketName = 'bucket-name'
    const key = 'path/to/file.jpg'
    const fileName = 'file.jpg'
    const lastModified = new Date(2020, 5, 4)
    const sizeBytes = 16
    const bucket: Bucket = { name: bucketName, region: 'region', arn: 'arn' }

    let s3: S3Client
    let temp: string
    let saveLocation: vscode.Uri
    let bucketNode: S3BucketNode
    let node: S3FileNode
    let window: FakeWindow
    let outputChannel: MockOutputChannel

    before(async function () {
        // TODO: write separate test code for the progress report behavior
        temp = await makeTemporaryToolkitFolder()
        saveLocation = vscode.Uri.file(temp)
    })

    beforeEach(function () {
        s3 = mock()

        bucketNode = new S3BucketNode(bucket, {} as S3Node, instance(s3))
        node = new S3FileNode(
            bucket,
            { name: fileName, key: key, arn: 'arn', lastModified, sizeBytes },
            bucketNode,
            instance(s3)
        )
        window = new FakeWindow({ dialog: { openSelections: [saveLocation] } })
        outputChannel = new MockOutputChannel()
    })

    it('prompts for save location, downloads file with progress, and shows output channel - single file', async function () {
        globals.context.globalState.update('aws.downloadPath', temp)

        when(s3.downloadFileStream(anything(), anything())).thenResolve(bufferToStream(Buffer.alloc(16)))

        await downloadFilesCommand(node, [], window, outputChannel)

        assert.deepStrictEqual(outputChannel.lines, ['Downloaded 1/1 files'])
        assert.strictEqual(outputChannel.isShown, true)
        assert.strictEqual(outputChannel.isFocused, false)
    })

    it('downloads files from folder, creates folder', async function () {
        const file1 = { name: 'file1', key: 'file1', arn: 'arn' }
        const file2 = { name: 'file2', key: 'file2', arn: 'arn2' }
        const folderNode = new S3FolderNode(bucket, { name: 'folderName' } as Folder, instance(s3))
        when(s3.listFiles(anything())).thenResolve({ files: [file1, file2], folders: [] })
        when(s3.downloadFileStream(anything(), anything())).thenResolve(bufferToStream(Buffer.alloc(16)))

        await downloadFilesCommand(folderNode, [], window, outputChannel)
        assert.strictEqual(
            fs.statSync(path.join(saveLocation.fsPath, 'folderName')).isDirectory(),
            true,
            'Expected a folder to be created'
        )

        assert.deepStrictEqual(outputChannel.lines, [`Downloaded 2/2 files`])
    })

    it('downloads multi selected files', async function () {
        const file2 = { name: 'file2', key: 'file2', arn: 'arn2' }
        const node2 = new S3FileNode(bucket, file2, bucketNode, instance(s3))

        when(s3.downloadFileStream(anything(), anything())).thenResolve(bufferToStream(Buffer.alloc(16)))

        await downloadFilesCommand(node, [node, node2], window, outputChannel)
        assert.deepStrictEqual(outputChannel.lines, ['Downloaded 2/2 files'])
    })

    it('does nothing when prompt is cancelled', async function () {
        await assert.rejects(() => downloadFilesCommand(node, [], new FakeWindow(), outputChannel), /[\s\S]*/i)
        verify(s3.downloadFileStream(anything(), anything())).never()
    })

    it('throws when download fails', async function () {
        when(s3.downloadFileStream(anything(), anything())).thenReject(new Error('Expected failure'))
        await assert.rejects(() => downloadFilesCommand(node, [], new FakeWindow(), outputChannel), /[\s\S]*/i)
    })
})
