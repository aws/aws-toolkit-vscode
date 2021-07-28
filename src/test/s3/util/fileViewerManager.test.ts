/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { S3BucketNode } from '../../../s3/explorer/s3BucketNode'
import { S3FileNode } from '../../../s3/explorer/s3FileNode'
import { S3FolderNode } from '../../../s3/explorer/s3FolderNode'
import { S3FileViewerManager, S3Tab } from '../../../s3/util/fileViewerManager'
import { DefaultFile, S3Client } from '../../../shared/clients/s3Client'
import { makeTemporaryToolkitFolder } from '../../../shared/filesystemUtilities'
import { FakeCommands } from '../../shared/vscode/fakeCommands'
import * as testutil from '../../testUtil'
import { anything, capture, instance, mock, when } from '../../utilities/mockito'

describe.only('FileViewerManager', function () {
    const bucketName = 'bucket-name'
    const key = 'file.jpg'
    const sizeBytes = 16
    const creationDate = new Date(2020, 7, 7)
    let file: DefaultFile
    let testNode: S3FileNode
    let s3: S3Client
    let fileViewerManager: S3FileViewerManager
    let mockedWindow: typeof vscode.window
    let testCache: Set<string>
    let tempPath: string
    let parent: S3BucketNode | S3FolderNode
    let commands: FakeCommands
    let tempFile: vscode.Uri
    let mockedWorkspace: typeof vscode.workspace
    let s3TempFile: vscode.Uri

    beforeEach(async function () {
        mockedWindow = mock()
        s3 = mock()
        parent = mock()
        mockedWorkspace = mock()
        tempPath = await makeTemporaryToolkitFolder()
        testCache = new Set<string>()
        commands = new FakeCommands()
        fileViewerManager = new S3FileViewerManager(testCache, instance(mockedWindow), commands, tempPath, undefined)
        file = new DefaultFile({
            partitionId: 'aws',
            bucketName,
            key,
            lastModified: creationDate,
            sizeBytes,
        })
        testNode = new S3FileNode({} as any, file, instance(parent), instance(s3))

        const completePath = await fileViewerManager.createTargetPath(testNode)

        tempFile = vscode.Uri.file(completePath)
        s3TempFile = vscode.Uri.parse('s3:' + tempFile.fsPath)
        testutil.toFile('bogus', tempFile.fsPath)
    })

    describe('cache', function () {
        let managerWithoutCache: S3FileViewerManager
        this.beforeEach(async function () {
            managerWithoutCache = new S3FileViewerManager()
        })

        it('creates a temporary folder', async function () {
            assert.strictEqual(managerWithoutCache.tempLocation, undefined)
            const tempLocation = await managerWithoutCache.createTemp()
            assert.deepStrictEqual(managerWithoutCache.tempLocation, tempLocation)
        })
    })

    describe('retrieves file from s3 if not in temp or invalid date', async function () {
        it('prompts if file has no specified size', async function () {
            when(mockedWindow.showWarningMessage(anything(), anything(), anything(), anything())).thenReturn(
                Promise.resolve({ title: 'Cancel' } as any)
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
            when(mockedWindow.showWarningMessage(anything(), anything(), anything(), anything())).thenReturn(
                Promise.resolve({ title: 'Cancel' } as any)
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

        it('downloads if prompts are confirmed', async function () {
            when(mockedWindow.showWarningMessage(anything(), anything(), anything(), anything())).thenReturn(
                Promise.resolve({ title: 'Continue with download' } as any)
            )

            file = new DefaultFile({
                partitionId: 'aws',
                bucketName,
                key: 'hello',
                lastModified: creationDate,
                sizeBytes: 5 * Math.pow(10, 6),
            })

            testNode = new S3FileNode({} as any, file, {} as any, instance(s3))

            when(s3.downloadFile(anything())).thenResolve()
            when(parent.getChildren()).thenResolve([testNode])

            assert.ok(!testCache.has(testNode.file.arn))

            await fileViewerManager.getFile(testNode)

            assert.ok(testCache.has(testNode.file.arn))
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

    it('opens a file in read-only mode', async function () {
        when(mockedWorkspace.openTextDocument(anything())).thenReturn(Promise.resolve({ uri: s3TempFile } as any))
        when(mockedWindow.showTextDocument(anything())).thenReturn({ data: 'expected result' } as any)

        const tab = {
            fileUri: tempFile,
            s3Uri: s3TempFile,
            editor: undefined,
            s3FileNode: testNode,
            type: '',
            charset: 'UTF-8',
        } as S3Tab

        await fileViewerManager.openFileGivenMode(tab, tab.s3Uri, false, instance(mockedWorkspace))

        const [uri] = capture(mockedWorkspace.openTextDocument).last()
        assert.strictEqual((uri as vscode.Uri).fsPath, s3TempFile.fsPath)
        assert.strictEqual((uri as vscode.Uri).scheme, s3TempFile.scheme)

        const [showDocArgs] = capture(mockedWindow.showTextDocument).last()

        assert.deepStrictEqual((showDocArgs as any).uri, s3TempFile)
    })

    it('opens a file in edit mode', async function () {
        when(mockedWorkspace.openTextDocument(anything())).thenReturn(Promise.resolve({ uri: tempFile } as any))
        // when(mockedWindow.showTextDocument(anything())).thenReturn({
        //     document: { uri: { scheme: 'file', fsPath: tempFile.fsPath } } as any,
        // } as any)
        when(mockedWindow.showTextDocument(anything())).thenReturn({ data: 'expected result' } as any)
        when(mockedWindow.visibleTextEditors).thenReturn([
            {
                document: {
                    uri: {
                        scheme: 'file',
                        fsPath: tempFile.fsPath,
                    },
                },
            } as any,
        ])

        const tab = {
            fileUri: tempFile,
            s3Uri: s3TempFile,
            editor: undefined,
            s3FileNode: testNode,
            type: '',
            charset: 'UTF-8',
        } as S3Tab

        await fileViewerManager.openFileGivenMode(tab, tab.fileUri, true, instance(mockedWorkspace))

        const [uri] = capture(mockedWorkspace.openTextDocument).last()
        assert.strictEqual((uri as vscode.Uri).fsPath, tempFile.fsPath)
        assert.strictEqual((uri as vscode.Uri).scheme, tempFile.scheme)

        const [showDocArgs] = capture(mockedWindow.showTextDocument).last()

        assert.deepStrictEqual((showDocArgs as any).uri, tempFile)
    })

    it('calls S3 when saving changes', async function () {
        when(s3.uploadFile(anything())).thenResolve()
        const tab = {
            fileUri: tempFile,
            s3Uri: s3TempFile,
            editor: undefined,
            s3FileNode: testNode,
        } as S3Tab

        const result = await fileViewerManager.uploadChangesToS3(tab)

        assert.ok(result)
    })
})
