/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import * as path from 'path'
import { S3 } from 'aws-sdk'
import { FileSizeBytes, getFileToUpload, promptUserForBucket, uploadFileCommand } from '../../../s3/commands/uploadFile'
import { S3Node } from '../../../s3/explorer/s3Nodes'
import { S3BucketNode } from '../../../s3/explorer/s3BucketNode'
import { S3Client } from '../../../shared/clients/s3Client'
import { MockOutputChannel } from '../../mockOutputChannel'
import { FakeWindow } from '../../shared/vscode/fakeWindow'
import { anything, mock, instance, when, capture } from '../../utilities/mockito'
import { Commands } from '../../../shared/vscode/commands'
import { Window } from '../../../shared/vscode/window'
import { FakeCommands } from '../../shared/vscode/fakeCommands'

describe('uploadFileCommand', function () {
    const bucketName = 'bucket-name'
    const key = 'file.jpg'
    const sizeBytes = 16
    const fileLocation = vscode.Uri.file('/file.jpg')
    const fileName = path.basename(fileLocation.fsPath)
    const statFile: FileSizeBytes = _file => sizeBytes
    let outputChannel: MockOutputChannel
    let s3: S3Client
    let bucketNode: S3BucketNode
    let window: FakeWindow
    let getBucket: (s3client: S3Client, window?: Window) => Promise<S3.Bucket | string>
    let getFile: (document?: vscode.Uri, window?: Window) => Promise<vscode.Uri | undefined>
    let commands: Commands

    beforeEach(function () {
        s3 = mock()
        commands = new FakeCommands()
        bucketNode = new S3BucketNode(
            { name: bucketName, region: 'region', arn: 'arn' },
            new S3Node(instance(s3)),
            instance(s3)
        )
        window = new FakeWindow({ dialog: { openSelections: [fileLocation] } })
        outputChannel = new MockOutputChannel()
    })

    describe('with node parameter', async function () {
        this.beforeEach(function () {
            s3 = mock()
            commands = new FakeCommands()
            bucketNode = new S3BucketNode(
                { name: bucketName, region: 'region', arn: 'arn' },
                new S3Node(instance(s3)),
                instance(s3)
            )
            window = new FakeWindow({ dialog: { openSelections: [fileLocation] } })
            outputChannel = new MockOutputChannel()
        })

        it('uploads successfully', async function () {
            when(s3.uploadFile(anything())).thenResolve()

            window = new FakeWindow({ dialog: { openSelections: [fileLocation] } })

            getFile = (document, window) => {
                return new Promise((resolve, reject) => {
                    resolve(fileLocation)
                })
            }

            await uploadFileCommand(
                instance(s3),
                bucketNode,
                statFile,
                undefined,
                getFile,
                window,
                outputChannel,
                commands
            )

            // eslint-disable-next-line @typescript-eslint/unbound-method
            const [uploadFileRequest] = capture(s3.uploadFile).last()

            assert.strictEqual(uploadFileRequest.bucketName, bucketName)
            assert.strictEqual(uploadFileRequest.key, key)
            assert.strictEqual(uploadFileRequest.fileLocation, fileLocation)

            uploadFileRequest.progressListener!(4) // +25% (+4/16)

            assert.deepStrictEqual(window.progress.reported, [{ increment: 25 }])
            assert.strictEqual(window.progress.options?.location, vscode.ProgressLocation.Notification)
            assert.strictEqual(window.progress.options?.title, 'Uploading file.jpg...')

            assert.deepStrictEqual(outputChannel.lines, [
                `Uploading file ${fileName} to s3://bucket-name/file.jpg`,
                `Successfully uploaded file ${fileName} to bucket-name`,
            ])
        })

        it('cancels and displays a message if a user does not select a file', async function () {
            window = new FakeWindow({ dialog: { openSelections: undefined } })

            getFile = (document, window) => {
                return new Promise((resolve, reject) => {
                    resolve(undefined)
                })
            }

            await uploadFileCommand(
                instance(s3),
                bucketNode,
                statFile,
                undefined,
                getFile,
                window,
                outputChannel,
                commands
            )
            assert.deepStrictEqual(outputChannel.lines, ['No file selected, cancelling upload'])
        })
    })

    describe('without node parameter', async function () {
        this.beforeEach(function () {
            s3 = mock()
            window = new FakeWindow({ dialog: { openSelections: [fileLocation] } })
            outputChannel = new MockOutputChannel()
            commands = new FakeCommands()
            getFile = (document, window) => {
                return new Promise((resolve, reject) => {
                    resolve(fileLocation)
                })
            }

            getBucket = s3Client => {
                return new Promise((resolve, reject) => {
                    resolve({ Name: bucketName })
                })
            }
        })

        it('uploads if user provides file and bucket', async function () {
            when(s3.uploadFile(anything())).thenResolve()

            await uploadFileCommand(
                instance(s3),
                undefined,
                statFile,
                getBucket,
                getFile,
                window,
                outputChannel,
                commands
            )
            assert.deepStrictEqual(outputChannel.lines, [
                `Uploading file ${fileName} to s3://bucket-name/file.jpg`,
                `Successfully uploaded file ${fileName} to bucket-name`,
            ])
        })

        it('cancels if user does not provide bucket', async function () {
            getBucket = s3Client => {
                return new Promise((resolve, reject) => {
                    resolve('cancel')
                })
            }

            await uploadFileCommand(
                instance(s3),
                undefined,
                statFile,
                getBucket,
                getFile,
                window,
                outputChannel,
                commands
            )
            assert.deepStrictEqual(outputChannel.lines, ['No bucket selected, cancelling upload'])
        })

        it('cancels if user does not select file', async function () {
            getFile = (document, window) => {
                return new Promise((resolve, reject) => {
                    resolve(undefined)
                })
            }

            await uploadFileCommand(
                instance(s3),
                undefined,
                statFile,
                getBucket,
                getFile,
                window,
                outputChannel,
                commands
            )
            assert.deepStrictEqual(outputChannel.lines, ['No file selected, cancelling upload'])
        })
    })

    getFile = (document, window) => {
        return new Promise((resolve, reject) => {
            resolve(fileLocation)
        })
    }

    getBucket = s3Client => {
        return new Promise((resolve, reject) => {
            resolve({ Name: bucketName })
        })
    }

    it('successfully upload file', async function () {
        when(s3.uploadFile(anything())).thenResolve()

        window = new FakeWindow({ dialog: { openSelections: [fileLocation] } })

        await uploadFileCommand(
            instance(s3),
            fileLocation,
            statFile,
            getBucket,
            getFile,
            window,
            outputChannel,
            commands
        )

        // eslint-disable-next-line @typescript-eslint/unbound-method
        const [uploadFileRequest] = capture(s3.uploadFile).last()

        assert.strictEqual(uploadFileRequest.bucketName, bucketName)
        assert.strictEqual(uploadFileRequest.key, key)
        assert.strictEqual(uploadFileRequest.fileLocation, fileLocation)

        uploadFileRequest.progressListener!(4) // +25% (+4/16)

        assert.deepStrictEqual(window.progress.reported, [{ increment: 25 }])
        assert.strictEqual(window.progress.options?.location, vscode.ProgressLocation.Notification)
        assert.strictEqual(window.progress.options?.title, 'Uploading file.jpg...')
        
        assert.deepStrictEqual(outputChannel.lines, [
            `Uploading file ${fileName} to s3://bucket-name/file.jpg`,
            `Successfully uploaded file ${fileName} to bucket-name`,
        ])
    })

    it('errors when s3 call fails', async function () {
        when(s3.uploadFile(anything())).thenReject(new Error('Expected failure'))

        window = new FakeWindow({ dialog: { openSelections: [fileLocation] } })
        outputChannel = new MockOutputChannel()
        await uploadFileCommand(
            instance(s3),
            fileLocation,
            statFile,
            getBucket,
            getFile,
            window,
            outputChannel,
            commands
        )

        assert.ok(window.message.error?.includes('Failed to upload file'))
    })
})

describe('getFileToUpload', function () {
    const fileLocation = vscode.Uri.file('/file.jpg')
    let window: FakeWindow

    const selection: any = { label: 'Browse for more files...' }
    const prompt: <T extends vscode.QuickPickItem>(opts: {
        picker: vscode.QuickPick<T>
        onDidTriggerButton?(
            button: vscode.QuickInputButton,
            resolve: (value: T[] | PromiseLike<T[] | undefined> | undefined) => void,
            reject: (reason?: any) => void
        ): void
    }) => Promise<T[] | undefined> = () => {
        return new Promise((resolve, reject) => {
            resolve([selection])
        })
    }

    beforeEach(function () {
        window = new FakeWindow({ dialog: { openSelections: [fileLocation] } })
    })

    it('directly asks user for file if no active editor', async function () {
        const response = await getFileToUpload(undefined, window, prompt)
        assert.strictEqual(response, fileLocation)
    })

    it('Returns undefined if no file is selected on first prompt', async function () {
        window = new FakeWindow({ dialog: { openSelections: undefined } })

        const response = await getFileToUpload(undefined, window, prompt)
        assert.strictEqual(response, undefined)
    })

    it('opens the current file if a user selects it from the prompt', async function () {
        const alreadyOpenedUri = vscode.Uri.file('/alreadyOpened.txt')
        selection.label = alreadyOpenedUri.fsPath

        const response = await getFileToUpload(alreadyOpenedUri, window, prompt)
        assert.strictEqual(response, alreadyOpenedUri)
    })

    it('opens the file prompt if a user selects to browse for more files', async function () {
        selection.label = 'Browse for more files...'

        const response = await getFileToUpload(fileLocation, window, prompt)
        assert.strictEqual(response, fileLocation)
    })

    it('returns undefined if the user does not select a file through the file browser', async function () {
        selection.label = 'Browse for more files...'
        window = new FakeWindow({ dialog: { openSelections: undefined } })

        const response = await getFileToUpload(fileLocation, window, prompt)

        assert.strictEqual(response, undefined)
    })
})

describe('promptUserForBucket', async function () {
    const fileLocation = vscode.Uri.file('/file.jpg')

    let s3: S3Client
    let buckets: S3.Bucket[]
    let window: FakeWindow

    const promptUndef: <T extends vscode.QuickPickItem>(opts: {
        picker: vscode.QuickPick<T>
        onDidTriggerButton?(
            button: vscode.QuickInputButton,
            resolve: (value: T[] | PromiseLike<T[] | undefined> | undefined) => void,
            reject: (reason?: any) => void
        ): void
    }) => Promise<T[] | undefined> = () => {
        return new Promise((resolve, reject) => {
            resolve(undefined)
        })
    }
    const selection: any = {
        label: 'bucket selected',
        bucket: { Name: 'bucket 1' },
    }
    const promptSelect: <T extends vscode.QuickPickItem>(opts: {
        picker: vscode.QuickPick<T>
        onDidTriggerButton?(
            button: vscode.QuickInputButton,
            resolve: (value: T[] | PromiseLike<T[] | undefined> | undefined) => void,
            reject: (reason?: any) => void
        ): void
    }) => Promise<T[] | undefined> = () => {
        return new Promise((resolve, reject) => {
            resolve([selection])
        })
    }

    beforeEach(function () {
        s3 = mock()
        buckets = [{ Name: 'bucket 1' }, { Name: 'bucket 2' }, { Name: 'bucket 3' }]
        window = new FakeWindow({ dialog: { openSelections: [fileLocation] } })
    })

    it('Returns selected bucket', async function () {
        when(s3.listAllBuckets()).thenResolve(buckets)

        const response = await promptUserForBucket(instance(s3), window, promptSelect)
        assert.deepStrictEqual(response, buckets[0])
    })

    it('Returns "back" when selected', async function () {
        when(s3.listAllBuckets()).thenResolve(buckets)

        selection.label = 'back'
        selection.bucket = undefined

        const response = await promptUserForBucket(instance(s3), window, promptSelect)
        assert.strictEqual(response, 'back')
    })

    it('Lets the user create a new bucket', async function () {
        when(s3.listAllBuckets()).thenResolve(buckets)

        selection.label = 'Create new bucket'
        selection.bucket = undefined

        const createBucket: (node?: S3Node, window?: Window, commands?: Commands) => Promise<void> = () => {
            window.showErrorMessage('Error expected')
            throw new Error('Error expected')
        }
        try {
            await promptUserForBucket(instance(s3), window, promptSelect, createBucket)
            assert.fail()
        } catch (e) {
            assert.ok(window.message.error?.includes('Error expected'))
        }
    })

    it('Returns "cancel" when user doesn\'t select a bucket', async function () {
        when(s3.listAllBuckets()).thenResolve(buckets)

        const response = await promptUserForBucket(instance(s3), window, promptUndef)
        assert.strictEqual(response, 'cancel')
    })

    it('Throws error when it is not possible to list buckets from client', async function () {
        when(s3.listAllBuckets()).thenReject(new Error('Expected failure'))

        const window = new FakeWindow({ dialog: { openSelections: [fileLocation] } })
        try {
            await promptUserForBucket(instance(s3), window)
            assert.fail() // fails if promptUserForBucket does not throw
        } catch (e) {
            assert.ok(window.message.error?.includes('Failed to list buckets from client'))
        }
    })
})
