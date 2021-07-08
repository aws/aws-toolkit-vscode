/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as assert from 'assert'
import * as path from 'path'
import * as testutil from '../../testUtil'
import { mock, when, instance, anything, capture } from '../../utilities/mockito'
import { S3FileViewerManager } from '../../../s3/util/fileViewerManager'
import { readablePath } from '../../../s3/util'
import { S3FileNode } from '../../../s3/explorer/s3FileNode'
import { S3BucketNode } from '../../../s3/explorer/s3BucketNode'
import { S3Node } from '../../../s3/explorer/s3Nodes'
import { Bucket, DefaultFile, S3Client } from '../../../shared/clients/s3Client'
import { FakeWindow } from '../../shared/vscode/fakeWindow'
import { FakeMessage } from '../../shared/vscode/fakeWindow'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { S3FolderNode } from '../../../s3/explorer/s3FolderNode'
import { FakeCommands } from '../../shared/vscode/fakeCommands'

describe.only('FileViewerManager', function () {
    const fileLocation = vscode.Uri.file('/file.jpg')
    const fileName = path.basename(fileLocation.fsPath)
    const bucketName = 'bucket-name'
    const key = 'file.jpg'
    const sizeBytes = 16
    const creationDate = new Date(2020, 7, 7)
    let file: DefaultFile
    let testNode: S3FileNode
    let s3: S3Client
    let fileViewerManager: S3FileViewerManager
    let window: typeof vscode.window
    let testCache: Set<string>
    let tempPath: string
    let tempUri: vscode.Uri
    let parent: S3BucketNode | S3FolderNode
    let commands: FakeCommands
    let tempFile: vscode.Uri

    beforeEach(async function () {
        window = mock()
        s3 = mock()
        parent = mock()
        tempPath = await makeTemporaryToolkitFolder()
        testCache = new Set<string>()
        commands = new FakeCommands()
        fileViewerManager = new S3FileViewerManager(testCache, instance(window), commands, tempPath)
        file = new DefaultFile({
            partitionId: 'aws',
            bucketName,
            key,
            lastModified: creationDate,
            sizeBytes,
        })
        testNode = new S3FileNode({} as any, file, instance(parent), instance(s3))

        tempUri = vscode.Uri.file(tempPath)
        let completePath = readablePath(testNode).slice(4).split('/').join(':')
        completePath = path.join(tempPath, 'S3:' + completePath)
        tempFile = vscode.Uri.file(completePath)
        testutil.toFile('bogus', tempFile.fsPath)
    })

    describe('retrieves file from s3 if not in temp or invalid date', function () {
        this.beforeEach(function () {})

        it('prompts if file has no specified size', async function () {
            when(window.showInformationMessage(anything(), anything(), anything())).thenReturn(
                Promise.resolve('Cancel')
            )

            file = new DefaultFile({
                partitionId: 'aws',
                bucketName,
                key,
                lastModified: creationDate,
                sizeBytes: undefined,
            })
            testNode = new S3FileNode({} as any, file, {} as any, instance(s3))

            assert.strictEqual(await fileViewerManager.getFile(testNode), undefined)
        })

        it('prompts if file size is greater than 4MB', async function () {
            when(window.showInformationMessage(anything(), anything(), anything())).thenReturn(
                Promise.resolve('Cancel')
            )

            file = new DefaultFile({
                partitionId: 'aws',
                bucketName,
                key: 'hello',
                lastModified: creationDate,
                sizeBytes: 5 * Math.pow(10, 6),
            })

            testNode = new S3FileNode({} as any, file, {} as any, instance(s3))

            assert.strictEqual(await fileViewerManager.getFile(testNode), undefined)
        })

        it('downloads and adds to cache', async function () {
            when(s3.downloadFile(anything())).thenResolve()
            when(parent.getChildren()).thenResolve([testNode])

            assert.ok(!testCache.has(testNode.file.arn))

            await fileViewerManager.getFile(testNode)

            assert.ok(testCache.has(testNode.file.arn))
        })
    })

    describe('uses cache', function () {
        this.beforeEach(async function () {
            await fileViewerManager.getFile(testNode)
        })

        it('compares the dates and continues to retreive', async function () {
            when(parent.getChildren()).thenResolve([testNode])

            const fileFromTemp = await fileViewerManager.getFromTemp(testNode)
            assert.deepStrictEqual(fileFromTemp, tempFile)
        })

        it('cancels retrieval and redownloads if file was modified in s3', async function () {
            file = new DefaultFile({
                partitionId: 'aws',
                bucketName,
                key,
                lastModified: new Date(2022, 7, 8),
                sizeBytes: 16,
            })
            const updatedNode = new S3FileNode({} as any, file, {} as any, instance(s3))
            when(parent.getChildren()).thenResolve([updatedNode])

            assert.deepStrictEqual(await fileViewerManager.getFromTemp(testNode), undefined)
        })
    })
})
