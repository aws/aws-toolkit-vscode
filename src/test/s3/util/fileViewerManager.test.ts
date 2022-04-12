/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { ManagedUpload } from 'aws-sdk/clients/s3'
import * as vscode from 'vscode'
import { S3FileProvider, S3FileViewerManager, S3_EDIT_SCHEME, S3_READ_SCHEME } from '../../../s3/fileViewerManager'
import {
    DefaultBucket,
    DefaultFile,
    DefaultS3Client,
    S3Client,
    UploadFileRequest,
} from '../../../shared/clients/s3Client'
import globals from '../../../shared/extensionGlobals'
import { VirualFileSystem } from '../../../shared/virtualFilesystem'
import { bufferToStream } from '../../../shared/utilities/streamUtilities'
import { createTestWindow, TestWindow } from '../../shared/vscode/window'
import { anything, instance, mock, when, resetCalls, verify } from '../../utilities/mockito'
import { MockOutputChannel } from '../../mockOutputChannel'
import { SeverityLevel } from '../../shared/vscode/message'
import { join } from 'path'
import { assertTextEditorContains, closeAllEditors } from '../../testUtil'
import { PromptSettings } from '../../../shared/settings'

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

const computeTag = (content: Buffer) => content.toString()
const makeFile = (key: string, content: Buffer) => {
    return Object.assign(
        new DefaultFile({
            key,
            partitionId: 'aws',
            bucketName: bucket.name,
            eTag: computeTag(content),
            sizeBytes: content.byteLength,
        }),
        { content }
    )
}

describe('S3FileProvider', function () {
    let s3: DefaultS3Client
    let provider: S3FileProvider
    let textFileContent: Buffer
    let textFile: DefaultFile
    let lastModified: Date
    // We can just stub the `uploadFile` function instead, though this executes more code paths
    let mockedUpload: ManagedUpload

    before(function () {
        // TODO: fix this dependency
        globals.outputChannel ??= new MockOutputChannel()
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

        when(s3.headObject(anything())).thenCall(async () => ({
            ETag: computeTag(textFileContent),
            ContentLength: textFile.sizeBytes,
            LastModified: lastModified,
        }))

        when(mockedUpload.promise()).thenCall(async () => ({
            ETag: computeTag(textFileContent),
            Key: textFile.key,
            Bucket: bucket.name,
            Location: textFile.key, // not correct, needs to be a URI but doesn't matter here
        }))
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

    it('fires an event when the eTag changes', async function () {
        const changed = new Promise<void>((resolve, reject) => {
            provider.onDidChange(resolve)
            setTimeout(() => reject(new Error('Event did not fire')), 1000)
        })
        await provider.write(Buffer.from('some text'))
        await changed
    })
})

describe('FileViewerManager', function () {
    let s3: S3Client
    let fs: VirualFileSystem
    let fileViewerManager: S3FileViewerManager
    let testWindow: TestWindow
    let workspace: typeof vscode.workspace
    let commands: typeof vscode.commands

    beforeEach(function () {
        s3 = mock()
        fs = new VirualFileSystem()
        workspace = mock()
        commands = mock()
        const window = (testWindow = createTestWindow())

        fileViewerManager = new S3FileViewerManager(
            () => instance(s3),
            fs,
            window,
            new PromptSettings(),
            instance(commands),
            instance(workspace)
        )
    })

    afterEach(async function () {
        await closeAllEditors()
    })

    it('prompts if file size is greater than 4MB', async function () {
        fileViewerManager.openInReadMode({ ...bigImage, bucket })
        await testWindow.waitForMessage(/File size is more than 4MB/).then(message => message.selectItem(/Continue/))
    })

    it('throws if the user cancels a download', async function () {
        const didOpen = fileViewerManager.openInReadMode({ ...bigImage, bucket })
        await testWindow.waitForMessage(/File size is more than 4MB/).then(message => message.selectItem(/Cancel/))
        await assert.rejects(didOpen)
    })

    describe('opens text files', function () {
        const textFile1Contents = Buffer.from('contents', 'utf-8')
        const textFile1 = makeFile('test1.txt', textFile1Contents)
        const textFile2Contents = Buffer.from('contents', 'utf-8')
        const textFile2 = makeFile('test2.txt', textFile2Contents)

        function mockOpen(file: ReturnType<typeof makeFile>, scheme: string = S3_READ_SCHEME) {
            const expectedPath = join('/', bucket.region, bucket.name, `[S3] ${file.name}`)
            when(workspace.openTextDocument(anything())).thenCall(async (uri: vscode.Uri) => {
                assert.strictEqual(uri.scheme, scheme)
                assert.strictEqual(uri.fsPath, expectedPath)
                // Currently easier to open a new document, though this isn't _exactly_ what the user would see
                return vscode.workspace.openTextDocument({ content: file.content.toString() })
            })
        }

        beforeEach(function () {
            resetCalls(workspace)
        })

        it('opens a new editor if no document exists', async function () {
            mockOpen(textFile1)
            await fileViewerManager.openInReadMode({ ...textFile1, bucket })
            await assertTextEditorContains(textFile1.content.toString())
        })

        it('closes the read-only tab when opening in edit mode', async function () {
            mockOpen(textFile1)
            await fileViewerManager.openInReadMode({ ...textFile1, bucket })

            when(commands.executeCommand('workbench.action.closeActiveEditor')).thenResolve()

            mockOpen(textFile1, S3_EDIT_SCHEME)
            await fileViewerManager.openInEditMode({ ...textFile1, bucket })

            verify(commands.executeCommand('workbench.action.closeActiveEditor')).once()
        })

        it('can open in edit mode, showing a warning with two options', async function () {
            const shownMessage = testWindow.waitForMessage(/You are now editing an S3 file./).then(message => {
                message.assertSeverity(SeverityLevel.Warning)
                assert.strictEqual(message.items.length, 2)
                return message
            })

            mockOpen(textFile1, S3_EDIT_SCHEME)
            await fileViewerManager.openInEditMode({ ...textFile1, bucket })

            await assertTextEditorContains(textFile1.content.toString())
            await shownMessage
        })

        it('re-uses an editor if already opened, focusing it', async function () {
            mockOpen(textFile1)
            await fileViewerManager.openInReadMode({ ...textFile1, bucket })
            mockOpen(textFile2)
            await fileViewerManager.openInReadMode({ ...textFile2, bucket })

            await assertTextEditorContains(textFile2.content.toString())

            mockOpen(textFile1)
            await fileViewerManager.openInReadMode({ ...textFile1, bucket })

            verify(workspace.openTextDocument(anything())).twice()
            await assertTextEditorContains(textFile1.content.toString())
        })
    })

    // TODO: test non-text files
    // this is a bit trickier since it uses webviews, not `TextEditor`
})
