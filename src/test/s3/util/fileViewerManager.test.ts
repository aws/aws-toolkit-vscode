/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { ManagedUpload } from 'aws-sdk/clients/s3'
import * as vscode from 'vscode'
import { S3FileProvider, S3FileViewerManager } from '../../../s3/fileViewerManager'
import { DefaultBucket, DefaultS3Client, File, toFile } from '../../../shared/clients/s3Client'
import globals from '../../../shared/extensionGlobals'
import { VirtualFileSystem } from '../../../shared/virtualFilesystem'
import { bufferToStream } from '../../../shared/utilities/streamUtilities'
import { MockOutputChannel } from '../../mockOutputChannel'
import { SeverityLevel } from '../../shared/vscode/message'
import { assertTelemetry, assertTextEditorContains } from '../../testUtil'
import { PromptSettings } from '../../../shared/settings'
import { stub } from '../../utilities/stubber'
import { assertHasProps } from '../../../shared/utilities/tsUtils'
import { ToolkitError } from '../../../shared/errors'
import { getTestWindow } from '../../shared/vscode/window'

const bucket = new DefaultBucket({
    name: 'bucket-name',
    region: 'us-west-2',
    partitionId: 'aws',
})

const bigImage = toFile(bucket, {
    ETag: '12345',
    Key: 'big-image.jpg',
    Size: 5 * Math.pow(10, 6),
})

const computeTag = (content: Buffer) => content.toString()
const makeFile = (key: string, content: Buffer) => {
    return Object.assign(
        toFile(bucket, {
            Key: key,
            ETag: computeTag(content),
            Size: content.byteLength,
            LastModified: new Date(),
        }),
        { content }
    )
}

type DataFile = File & { readonly content: Buffer }
function createS3() {
    const files = new Map<string, DataFile>()
    const client = stub(DefaultS3Client, { regionCode: bucket.region })
    client.downloadFileStream.callsFake(async (_, key) => bufferToStream(getFile(key).content))
    client.headObject.callsFake(async req => getFile(req.key))
    client.uploadFile.callsFake(async req => {
        if (req.content instanceof vscode.Uri) {
            throw new Error('Did not expect a URI, expected a Buffer')
        }
        const newFile = {
            ...makeFile(req.key, Buffer.from(req.content)),
            ContentType: req.contentType,
        }
        assertHasProps(newFile, 'Key', 'ETag')
        files.set(newFile.key, newFile)

        const upload = stub(ManagedUpload)
        upload.promise.resolves({
            ...newFile,
            Bucket: bucket.name,
            Location: newFile.key,
        })

        return upload
    })

    function getFile(key: string) {
        const file = files.get(key)
        assert.ok(file, `No file found for key "${key}"`)

        return file
    }

    function addFile(file: DataFile) {
        assert.strictEqual(files.get(file.key), undefined, `File "${file.key}" already exists`)
        files.set(file.key, file)
    }

    return { client, addFile, getFile }
}

describe('S3FileProvider', function () {
    const textFile = makeFile('file.txt', Buffer.from('content', 'utf-8'))
    let provider: S3FileProvider
    let s3: ReturnType<typeof createS3>

    function createProvider(file: DataFile) {
        return new S3FileProvider(s3.client, { ...file, bucket })
    }

    before(function () {
        // TODO: fix this dependency
        globals.outputChannel ??= new MockOutputChannel()
    })

    beforeEach(function () {
        s3 = createS3()
        s3.addFile(textFile)
        provider = createProvider(textFile)
    })

    it('can read contents from s3', async function () {
        const content = await provider.read()
        assert.deepStrictEqual(content, s3.getFile(textFile.key).content)
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
            mtime: textFile.lastModified?.getTime(),
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

    it('uses mime type if no content type exists', async function () {
        await provider.refresh()
        await provider.write(Buffer.from('some text'))
        assert.strictEqual(s3.getFile(textFile.key).ContentType, 'text/plain; charset=utf-8')
    })

    it('preserves content types if present', async function () {
        const jsonFile = {
            ...makeFile('json-blob', Buffer.from('{}')),
            ContentType: 'application/json',
        }
        s3.addFile(jsonFile)
        const newData = Buffer.from(JSON.stringify({ foo: 'bar' }))
        const provider = createProvider(jsonFile)
        await provider.refresh()
        await provider.write(newData)

        const result = s3.getFile(jsonFile.key)
        assert.deepStrictEqual(result.content, newData)
        assert.deepStrictEqual(result.ContentType, jsonFile.ContentType)
    })

    it('emits telemetry when downloading', async function () {
        await provider.read()
        assertTelemetry('s3_downloadObject', {
            component: 'viewer',
            result: 'Succeeded',
        })
    })

    it('emits telemetry when uploading', async function () {
        await provider.write(Buffer.from('111', 'utf-8'))
        assertTelemetry('s3_uploadObject', {
            component: 'viewer',
            result: 'Succeeded',
        })
    })
})

describe('FileViewerManager', function () {
    const readScheme = 's3-read-test'
    const editScheme = 's3-edit-test'
    let s3: ReturnType<typeof createS3>
    let fs: VirtualFileSystem
    let fileViewerManager: S3FileViewerManager
    let disposables: vscode.Disposable[]

    function findEditors(documentName: string, window = vscode.window) {
        return window.visibleTextEditors.filter(e => e.document.fileName.endsWith(documentName))
    }

    function registerFileSystemProviders(): vscode.Disposable[] {
        return [
            vscode.workspace.registerFileSystemProvider(editScheme, fs, { isCaseSensitive: true }),
            vscode.workspace.registerFileSystemProvider(readScheme, fs, { isReadonly: true, isCaseSensitive: true }),
        ]
    }

    before(function () {
        s3 = createS3()
        fs = new VirtualFileSystem()

        fileViewerManager = new S3FileViewerManager(() => s3.client, fs, new PromptSettings(), {
            read: readScheme,
            edit: editScheme,
        })

        disposables = registerFileSystemProviders()

        const bigImageFile = makeFile('big-image.jpg', Buffer.from('fake image', 'utf-8'))
        s3.addFile(bigImageFile)
    })

    afterEach(async function () {
        await fileViewerManager.closeEditors()
    })

    after(async function () {
        await vscode.Disposable.from(...disposables).dispose()
        await fileViewerManager.dispose()
    })

    it('prompts if file size is greater than 4MB', async function () {
        // User can "Continue".
        const didOpen = fileViewerManager.openInReadMode({ ...bigImage, bucket })
        await getTestWindow()
            .waitForMessage(/File size is more than 4MB/)
            .then(message => message.selectItem(/Continue/))
        await (await didOpen)?.dispose()
    })

    it('throws if the user cancels a download', async function () {
        // User can "Cancel".
        const didOpen = fileViewerManager.openInReadMode({ ...bigImage, bucket })
        await getTestWindow()
            .waitForMessage(/File size is more than 4MB/)
            .then(message => message.selectItem(/Cancel/))
        await assert.rejects(didOpen)
    })

    describe('opens text files', function () {
        const textFile1Contents = Buffer.from('test1 contents', 'utf-8')
        const textFile1 = makeFile('test1.txt', textFile1Contents)
        const textFile2Contents = Buffer.from('test2 contents', 'utf-8')
        const textFile2 = makeFile('test2.txt', textFile2Contents)

        before(function () {
            s3.addFile(textFile1)
            s3.addFile(textFile2)
        })

        it('opens a new editor if no document exists', async function () {
            await fileViewerManager.openInReadMode({ ...textFile1, bucket })
            await assertTextEditorContains(textFile1.content.toString())
        })

        it('closes the read-only tab when opening in edit mode', async function () {
            await fileViewerManager.openInReadMode({ ...textFile1, bucket })
            await fileViewerManager.openInEditMode({ ...textFile1, bucket })
            const editors = findEditors(textFile1.name)
            assert.strictEqual(editors.length, 1)
            assert.strictEqual(findEditors(textFile1.name)[0]?.document.uri.scheme, editScheme)
        })

        it('re-uses tabs in edit mode when opening as read-only', async function () {
            await fileViewerManager.openInEditMode({ ...textFile1, bucket })
            await fileViewerManager.openInReadMode({ ...textFile1, bucket })
            const editors = findEditors(textFile1.name)
            assert.strictEqual(editors.length, 1)
            assert.strictEqual(findEditors(textFile1.name)[0]?.document.uri.scheme, editScheme)
        })

        it('can open in edit mode, showing a warning with two options', async function () {
            const shownMessage = getTestWindow()
                .waitForMessage(/You are now editing an S3 file./)
                .then(message => {
                    message.assertSeverity(SeverityLevel.Warning)
                    assert.strictEqual(message.items.length, 2)
                    return message
                })

            await fileViewerManager.openInEditMode({ ...textFile1, bucket })

            await assertTextEditorContains(textFile1.content.toString())
            await shownMessage
        })

        it('re-uses an editor if already opened, focusing it', async function () {
            await fileViewerManager.openInReadMode({ ...textFile1, bucket })
            await fileViewerManager.openInReadMode({ ...textFile2, bucket })

            await assertTextEditorContains(textFile2.content.toString())

            await fileViewerManager.openInReadMode({ ...textFile1, bucket })
            await assertTextEditorContains(textFile1.content.toString())
            assert.strictEqual(findEditors(textFile1.name).length, 1)
        })

        it('can open an S3 file with reserved URI characters', async function () {
            const contents = Buffer.from('text', 'utf-8')
            const file = makeFile('us-west-2:3cff280c/file.txt', contents)
            s3.addFile(file)

            await fileViewerManager.openInReadMode({ ...file, bucket })
            await assertTextEditorContains(contents.toString())
        })

        it('can open files with no file extension', async function () {
            const contents = Buffer.from('text', 'utf-8')
            const file = makeFile('us-west-2:3cff280c/file', contents)
            s3.addFile(file)

            await fileViewerManager.openInReadMode({ ...file, bucket })
            await assertTextEditorContains(contents.toString())
        })

        it('rejects if the file does not exist', async function () {
            const file = makeFile('foo.txt', Buffer.from('0', 'utf-8'))
            const err = await fileViewerManager.openInReadMode({ ...file, bucket }).catch(e => e)
            assert.ok(err instanceof ToolkitError)
        })

        it('is case-sensitive for file names', async function () {
            // Create and assert content of file with lowercase name
            const lowerCaseFileContent = 'lowercaseContent'
            const lowerCaseFile = makeFile('myFile.txt', Buffer.from(lowerCaseFileContent, 'utf-8'))
            s3.addFile(lowerCaseFile)
            await fileViewerManager.openInReadMode({ ...lowerCaseFile, bucket })
            await assertTextEditorContains(lowerCaseFileContent)

            // Create similarily named file, but with different uppercase in name
            const upperCaseFileContent = 'uppercaseContent'
            const upperCaseFile = makeFile('MyFile.txt', Buffer.from(upperCaseFileContent, 'utf-8'))
            s3.addFile(upperCaseFile)
            await fileViewerManager.openInReadMode({ ...upperCaseFile, bucket })
            await assertTextEditorContains(upperCaseFileContent)
        })
    })
})
