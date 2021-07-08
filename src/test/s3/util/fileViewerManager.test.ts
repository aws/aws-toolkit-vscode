/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as assert from 'assert'
import * as path from 'path'
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
    const creationDate = new Date(2021, 7, 7)
    let file: DefaultFile
    let testNode: S3FileNode
    let s3: S3Client
    let fileViewerManager: S3FileViewerManager
    let window: typeof vscode.window
    let testCache: Set<string>
    let tempLocation: string
    let parent: S3BucketNode | S3FolderNode
    let commands: FakeCommands

    beforeEach(async function () {
        window = mock()
        s3 = mock()
        parent = mock()
        tempLocation = await makeTemporaryToolkitFolder()
        testCache = new Set<string>()
        commands = new FakeCommands()
        fileViewerManager = new S3FileViewerManager(testCache, instance(window), commands, tempLocation)
        await fileViewerManager.createTemp()
        file = new DefaultFile({
            partitionId: 'aws',
            bucketName,
            key,
            lastModified: creationDate,
            sizeBytes,
        })
        testNode = new S3FileNode({} as any, file, instance(parent), instance(s3))
    })

    describe('creates a temporary folder', function () {})

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

            let completePath = readablePath(testNode)
            completePath = completePath.slice(4)

            const splittedPath = completePath.split('/')
            completePath = splittedPath.join(':')

            assert.ok(!testCache.has(testNode.file.arn))

            await fileViewerManager.getFile(testNode)

            assert.ok(testCache.has(testNode.file.arn))
        })
    })

    describe('uses cache', function () {
        it('refreshes the given fileNode to get the last modified date on s3', function () {})

        it('compares the dates and continues to retreive', function () {})

        it('cancels retrieval and redownloads if file was modified in s3', function () {})
    })
})
