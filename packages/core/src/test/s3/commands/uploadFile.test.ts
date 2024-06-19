/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'
import { S3 } from 'aws-sdk'
import {
    FileSizeBytes,
    getFilesToUpload,
    promptUserForBucket,
    uploadFileCommand,
    BucketQuickPickItem,
} from '../../../s3/commands/uploadFile'
import { S3Node } from '../../../s3/explorer/s3Nodes'
import { S3BucketNode } from '../../../s3/explorer/s3BucketNode'
import { S3Client } from '../../../shared/clients/s3Client'
import { MockOutputChannel } from '../../mockOutputChannel'
import { getTestWindow } from '../../shared/vscode/window'
import sinon from 'sinon'

describe('uploadFileCommand', function () {
    const bucketName = 'bucket-name'
    const key = 'file.jpg'
    const sizeBytes = 16
    const fileLocation = vscode.Uri.file('/file.jpg')
    const statFile: FileSizeBytes = _file => sizeBytes
    const bucketResponse = { label: 'label', bucket: { Name: bucketName } }
    const folderResponse = {
        label: 'label',
        bucket: { Name: bucketName },
        folder: { name: 'folderA', path: 'folderA/', arn: 'arn' },
    }
    const getFolder: (s3client: S3Client) => Promise<BucketQuickPickItem | 'cancel' | 'back'> = s3Client => {
        return new Promise((resolve, reject) => {
            resolve(folderResponse)
        })
    }
    let outputChannel: MockOutputChannel
    let s3: S3Client
    let bucketNode: S3BucketNode
    let getBucket: (s3client: S3Client) => Promise<BucketQuickPickItem | 'cancel' | 'back'>
    let getFile: (document?: vscode.Uri) => Promise<vscode.Uri[] | undefined>
    let mockedUpload: S3.ManagedUpload

    beforeEach(function () {
        mockedUpload = {} as any as S3.ManagedUpload
        s3 = {} as any as S3Client
        bucketNode = new S3BucketNode({ name: bucketName, region: 'region', arn: 'arn' }, new S3Node(s3), s3)
        outputChannel = new MockOutputChannel()
    })

    describe('with node parameter', async function () {
        this.beforeEach(function () {
            s3 = {} as any as S3Client
            bucketNode = new S3BucketNode({ name: bucketName, region: 'region', arn: 'arn' }, new S3Node(s3), s3)
            outputChannel = new MockOutputChannel()
        })

        it('uploads successfully', async function () {
            const uploadStub = sinon.stub().resolves(mockedUpload)
            s3.uploadFile = uploadStub
            const promiseStub = sinon.stub().resolves()
            mockedUpload.promise = promiseStub

            getFile = document => {
                return new Promise((resolve, reject) => {
                    resolve([fileLocation])
                })
            }

            await uploadFileCommand(s3, bucketNode, statFile, undefined, getFile, outputChannel)

            const [uploadFileRequest] = uploadStub.lastCall.args

            assert.strictEqual(uploadFileRequest.bucketName, bucketName)
            assert.strictEqual(uploadFileRequest.key, key)
            assert.strictEqual(uploadFileRequest.content, fileLocation)

            assert.deepStrictEqual(outputChannel.lines, [
                'Uploading file file.jpg to s3://bucket-name/file.jpg',
                'Uploaded 1/1 files',
            ])
        })

        it('cancels and displays a message if a user does not select a file', async function () {
            getFile = document => {
                return new Promise((resolve, reject) => {
                    resolve(undefined)
                })
            }

            await uploadFileCommand(s3, bucketNode, statFile, undefined, getFile, outputChannel)
            assert.deepStrictEqual(outputChannel.lines, ['No file selected, cancelling upload'])
        })
    })

    describe('without node parameter', async function () {
        this.beforeEach(function () {
            s3 = {} as any as S3Client
            outputChannel = new MockOutputChannel()
            getFile = document => {
                return new Promise((resolve, reject) => {
                    resolve([fileLocation])
                })
            }

            getBucket = s3Client => {
                return new Promise((resolve, reject) => {
                    resolve(bucketResponse)
                })
            }
        })

        it('uploads if user provides file and bucket', async function () {
            const uploadStub = sinon.stub().resolves(mockedUpload)
            s3.uploadFile = uploadStub
            const promiseStub = sinon.stub().resolves()
            mockedUpload.promise = promiseStub

            await uploadFileCommand(s3, undefined, statFile, getBucket, getFile, outputChannel)

            assert.deepStrictEqual(outputChannel.lines, [
                'Uploading file file.jpg to s3://bucket-name/file.jpg',
                'Uploaded 1/1 files',
            ])
        })

        it('cancels if user does not provide bucket', async function () {
            getBucket = s3Client => {
                return new Promise((resolve, reject) => {
                    resolve('cancel')
                })
            }

            await uploadFileCommand(s3, undefined, statFile, getBucket, getFile, outputChannel)
            assert.deepStrictEqual(outputChannel.lines, ['No bucket selected, cancelling upload'])
        })

        it('cancels if user does not select file', async function () {
            getFile = document => {
                return new Promise((resolve, reject) => {
                    resolve(undefined)
                })
            }

            await uploadFileCommand(s3, undefined, statFile, getBucket, getFile, outputChannel)
            assert.deepStrictEqual(outputChannel.lines, ['No file selected, cancelling upload'])
        })
    })

    getFile = document => {
        return new Promise((resolve, reject) => {
            resolve([fileLocation])
        })
    }

    getBucket = s3Client => {
        return new Promise((resolve, reject) => {
            resolve(bucketResponse)
        })
    }

    it('successfully upload file or folder', async function () {
        const uploadStub = sinon.stub().resolves(mockedUpload)
        s3.uploadFile = uploadStub
        const promiseStub = sinon.stub().resolves()
        mockedUpload.promise = promiseStub
        getTestWindow().onDidShowDialog(d => d.selectItem(fileLocation))

        // Upload to bucket.
        await uploadFileCommand(s3, fileLocation, statFile, getBucket, getFile, outputChannel)
        // Upload to folder.
        await uploadFileCommand(s3, fileLocation, statFile, getFolder, getFile, outputChannel)

        assert.deepStrictEqual(outputChannel.lines, [
            'Uploading file file.jpg to s3://bucket-name/file.jpg',
            `Uploaded 1/1 files`,
            'Uploading file file.jpg to s3://bucket-name/folderA/file.jpg',
            `Uploaded 1/1 files`,
        ])
    })

    it('errors when s3 call fails', async function () {
        const uploadStub = sinon.stub().rejects(new Error('Expected failure'))
        s3.uploadFile = uploadStub
        getTestWindow().onDidShowDialog(d => d.selectItem(fileLocation))
        getTestWindow().onDidShowMessage(m => m.close())

        outputChannel = new MockOutputChannel()
        await uploadFileCommand(s3, fileLocation, statFile, getBucket, getFile, outputChannel)

        assert.deepStrictEqual(outputChannel.lines, [
            'Uploading file file.jpg to s3://bucket-name/file.jpg',
            `Failed to upload file file.jpg: Expected failure`,
            'Uploaded 0/1 files',
            'Failed uploads:',
            `${key}`,
        ])
    })
})

describe('getFileToUpload', function () {
    const fileLocation = vscode.Uri.file('/file.jpg')

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

    it('directly asks user for file if no active editor', async function () {
        getTestWindow().onDidShowDialog(d => d.selectItem(fileLocation))
        const response = await getFilesToUpload(undefined, prompt)
        assert.deepStrictEqual(response, [fileLocation])
    })

    it('Returns undefined if no file is selected on first prompt', async function () {
        getTestWindow().onDidShowDialog(d => d.close())
        const response = await getFilesToUpload(undefined, prompt)
        assert.strictEqual(response, undefined)
    })

    it('opens the current file if a user selects it from the prompt', async function () {
        const alreadyOpenedUri = vscode.Uri.file('/alreadyOpened.txt')
        selection.label = alreadyOpenedUri.fsPath

        const response = await getFilesToUpload(alreadyOpenedUri, prompt)
        assert.deepStrictEqual(response, [alreadyOpenedUri])
    })

    it('opens the file prompt if a user selects to browse for more files', async function () {
        selection.label = 'Browse for more files...'
        getTestWindow().onDidShowDialog(d => d.selectItem(fileLocation))

        const response = await getFilesToUpload(fileLocation, prompt)
        assert.deepStrictEqual(response, [fileLocation])
    })

    it('returns undefined if the user does not select a file through the file browser', async function () {
        selection.label = 'Browse for more files...'
        getTestWindow().onDidShowDialog(d => d.close())

        const response = await getFilesToUpload(fileLocation, prompt)

        assert.strictEqual(response, undefined)
    })
})

describe('promptUserForBucket', async function () {
    const fileLocation = vscode.Uri.file('/file.jpg')

    let s3: S3Client
    let buckets: S3.Bucket[]

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
        s3 = {} as any as S3Client
        buckets = [{ Name: 'bucket 1' }, { Name: 'bucket 2' }, { Name: 'bucket 3' }]
        getTestWindow().onDidShowDialog(d => d.selectItem(fileLocation))
    })

    it('Returns selected bucket', async function () {
        const stub = sinon.stub().resolves(buckets)
        s3.listAllBuckets = stub

        const response = await promptUserForBucket(s3, promptSelect)
        assert.deepStrictEqual(response, selection)
    })

    it('Returns "back" when selected', async function () {
        const stub = sinon.stub().resolves(buckets)
        s3.listAllBuckets = stub

        selection.label = 'back'
        selection.bucket = undefined

        const response = await promptUserForBucket(s3, promptSelect)
        assert.strictEqual(response, 'back')
    })

    it('Lets the user create a new bucket', async function () {
        const stub = sinon.stub().resolves(buckets)
        s3.listAllBuckets = stub

        selection.label = 'Create new bucket'
        selection.bucket = undefined

        const createBucket: (node?: S3Node) => Promise<void> = () => {
            throw new Error('Error expected')
        }
        await assert.rejects(() => promptUserForBucket(s3, promptSelect, createBucket))
    })

    it('Returns "cancel" when user doesn\'t select a bucket', async function () {
        const stub = sinon.stub().resolves(buckets)
        s3.listAllBuckets = stub

        const response = await promptUserForBucket(s3, promptUndef)
        assert.strictEqual(response, 'cancel')
    })

    it('Throws error when it is not possible to list buckets from client', async function () {
        const stub = sinon.stub().rejects(new Error('Expected failure'))
        s3.listAllBuckets = stub
        await assert.rejects(() => promptUserForBucket(s3))
        getTestWindow()
            .getFirstMessage()
            .assertError(/Failed to list buckets from client/)
    })
})
