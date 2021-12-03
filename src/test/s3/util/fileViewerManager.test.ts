/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import { ManagedUpload } from 'aws-sdk/clients/s3'
import * as vscode from 'vscode'
import { S3FileProvider, S3FileViewerManager } from '../../../s3/fileViewerManager'
import {
    DefaultBucket,
    DefaultFile,
    DefaultS3Client,
    S3Client,
    UploadFileRequest,
} from '../../../shared/clients/s3Client'
import { ext } from '../../../shared/extensionGlobals'
import { MemoryFileSystem } from '../../../shared/memoryFilesystem'
import { bufferToStream } from '../../../shared/utilities/streamUtilities'
import { createTestWindow, TestWindow } from '../../shared/vscode/window'
import { anything, instance, mock, when } from '../../utilities/mockito'
import { MockOutputChannel } from '../../mockOutputChannel'

describe('S3FileProvider', function () {
    let s3: DefaultS3Client
    let provider: S3FileProvider
    let textFileContent: Buffer
    let textFile: DefaultFile
    let lastModified: Date
    let mockedUpload: ManagedUpload

    const bucket = new DefaultBucket({
        name: 'bucket-name',
        region: 'us-west-2',
        partitionId: 'aws',
    })

    const computeTag = (content: Buffer) => content.toString()
    const makeFile = (key: string, content: Buffer) => {
        return new DefaultFile({
            key,
            partitionId: 'aws',
            bucketName: bucket.name,
            eTag: computeTag(content),
            sizeBytes: content.byteLength,
        })
    }

    before(function () {
        // TODO: fix this dependency
        ext.outputChannel ??= new MockOutputChannel()
    })

    beforeEach(function () {
        s3 = mock()
        mockedUpload = mock()

        textFileContent = Buffer.from('content', 'utf-8')
        textFile = makeFile('file.txt', textFileContent)
        lastModified = new Date()
        provider = new S3FileProvider(instance(s3), { ...textFile, bucket })

        when(s3.downloadFileStream(bucket.name, textFile.key)).thenCall(async () => bufferToStream(textFileContent))
        when(s3.uploadFile(anything())).thenCall(async (request: UploadFileRequest) => {
            // assumed that key + bucket is the same for all calls
            if (request.content instanceof vscode.Uri) {
                throw new Error('Did not expect a URI, expected a Buffer')
            }
            textFileContent = Buffer.from(request.content)
            textFile = makeFile('file.txt', textFileContent)
            lastModified = new Date()

            return instance(mockedUpload)
        })
        when(s3.headObject(anything())).thenResolve({
            ETag: textFile.eTag,
            ContentLength: textFile.sizeBytes,
            LastModified: lastModified,
        })
        when(mockedUpload.promise()).thenResolve({
            ETag: textFile.eTag ?? '',
            Key: textFile.key,
            Bucket: bucket.name,
            Location: textFile.key, // not correct, needs to be a URI but doesn't matter here
        })
    })

    it('can read contents from s3', async function () {
        const content = await provider.read()
        assert.deepStrictEqual(content, textFileContent)
    })

    it('can upload to s3', async function () {
        const newContent = Buffer.from('new content', 'utf-8')
        await provider.write(newContent)
        assert.deepStrictEqual(await provider.read(), newContent)
    })

    it('can use `stat`', async function () {
        const stats = await provider.stat()
        assert.deepStrictEqual(stats, {
            ctime: 0,
            size: textFile.sizeBytes,
            mtime: lastModified.getTime(),
        })
    })
})

describe('FileViewerManager', function () {
    let s3: S3Client
    let fileViewerManager: S3FileViewerManager
    let memFs: MemoryFileSystem
    let testWindow: TestWindow

    const bucket = new DefaultBucket({
        name: 'bucket-name',
        region: 'us-west-2',
        partitionId: 'aws',
    })

    const bigImage = new DefaultFile({
        bucketName: bucket.name,
        eTag: '12345',
        key: 'big-image.jpg',
        sizeBytes: 5 * Math.pow(10, 6),
        partitionId: 'aws',
    })

    before(function () {
        // temporary stub to `showTextDocument` and `openTextDocument`
        sinon.stub(vscode.window, 'showTextDocument').resolves()
        sinon.stub(vscode.workspace, 'openTextDocument').resolves()
    })

    beforeEach(function () {
        s3 = mock()
        memFs = new MemoryFileSystem()
        fileViewerManager = new S3FileViewerManager(() => instance(s3), memFs)
        ext.window = testWindow = createTestWindow()
    })

    after(function () {
        sinon.restore()
    })

    it('prompts for download if the file size is larger than 4mb', async function () {
        const didOpen = fileViewerManager.openInReadMode({ ...bigImage, bucket })

        // currently causes an unhandled rejected promise since it executes the `vscode.open` command
        await testWindow.waitForMessage(/File size is more than 4MB/).then(message => message.selectItem(/Continue/))

        await didOpen
    })

    it('throws if the user cancels a download', async function () {
        const didOpen = fileViewerManager.openInReadMode({ ...bigImage, bucket })

        await testWindow.waitForMessage(/File size is more than 4MB/).then(message => message.selectItem(/Cancel/))

        await assert.rejects(didOpen)
    })

    /*
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

        await fileViewerManager.openTextFile(tab, tab.s3Uri, false, instance(mockedWorkspace))

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

        await fileViewerManager.openTextFile(tab, tab.fileUri, true, instance(mockedWorkspace))

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
    */
})
