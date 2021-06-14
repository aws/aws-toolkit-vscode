/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { S3 } from 'aws-sdk'
import { FileSizeBytes, getFileToUpload, promptUserForBucket, uploadFileCommand, uploadFileToS3Command } from '../../../s3/commands/uploadFile'
import { S3BucketNode } from '../../../s3/explorer/s3BucketNode'
import { S3Node } from '../../../s3/explorer/s3Nodes'
import { S3Client } from '../../../shared/clients/s3Client'
import { MockOutputChannel } from '../../mockOutputChannel'
import { FakeCommands } from '../../shared/vscode/fakeCommands'
import { FakeWindow } from '../../shared/vscode/fakeWindow'
import { anything, mock, instance, when, capture, verify } from '../../utilities/mockito'
import { Commands } from '../../../shared/vscode/commands'
import { Window } from '../../../shared/vscode/window'

describe('uploadFileCommand', function () {
    const bucketName = 'bucket-name'
    const key = 'file.jpg'
    const sizeBytes = 16
    const fileLocation = vscode.Uri.file('/file.jpg')
    const statFile: FileSizeBytes = _file => sizeBytes

    let s3: S3Client
    let node: S3BucketNode

    beforeEach(function () {
        s3 = mock()
        node = new S3BucketNode(
            { name: bucketName, region: 'region', arn: 'arn' },
            new S3Node(instance(s3)),
            instance(s3)
        )
    })

    it('prompts for file location, uploads file with progress, shows output channel, and refreshes node', async function () {
        when(s3.uploadFile(anything())).thenResolve()

        const window = new FakeWindow({ dialog: { openSelections: [fileLocation] } })
        const commands = new FakeCommands()
        const outputChannel = new MockOutputChannel()
        await uploadFileCommand(node, statFile, window, commands, outputChannel)

        // eslint-disable-next-line @typescript-eslint/unbound-method
        const [uploadFileRequest] = capture(s3.uploadFile).last()

        assert.strictEqual(window.dialog.openOptions?.openLabel, 'Upload')

        assert.strictEqual(uploadFileRequest.bucketName, bucketName)
        assert.strictEqual(uploadFileRequest.key, key)
        assert.strictEqual(uploadFileRequest.fileLocation, fileLocation)

        uploadFileRequest.progressListener!(4) // +25% (+4/16)

        assert.deepStrictEqual(window.progress.reported, [{ increment: 25 }])
        assert.strictEqual(window.progress.options?.location, vscode.ProgressLocation.Notification)
        assert.strictEqual(window.progress.options?.title, 'Uploading file.jpg...')

        assert.deepStrictEqual(outputChannel.lines, [
            `Uploading file from ${fileLocation} to s3://bucket-name/file.jpg`,
            `Successfully uploaded file s3://bucket-name/file.jpg`,
        ])
        assert.strictEqual(outputChannel.isShown, true)
        assert.strictEqual(outputChannel.isFocused, false)

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [node])
    })

    it('does nothing when prompt is cancelled', async function () {
        await uploadFileCommand(node, statFile, new FakeWindow(), new FakeCommands())

        verify(s3.uploadFile(anything())).never()
    })

    it('shows an error message when upload fails', async function () {
        when(s3.uploadFile(anything())).thenReject(new Error('Expected failure'))

        const window = new FakeWindow({ dialog: { openSelections: [fileLocation] } })
        const commands = new FakeCommands()
        await uploadFileCommand(node, statFile, window, commands)

        assert.ok(window.message.error?.includes('Failed to upload file'))

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [node])
    })
})

describe('getFileToUpload', function () {
    const fileLocation = vscode.Uri.file('/file.jpg')    
    let window: FakeWindow

    beforeEach(function () {
        window = new FakeWindow({ dialog: { openSelections: [fileLocation] } })

    })
    

    //How do I test this?
    it("directly asks user for file if no active editor", async function () {
        const selection: any = {label: "Browse for more files..." }
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
        window = new FakeWindow({ dialog: { openSelections: [fileLocation] } })
        
        const response = await getFileToUpload(undefined, window, prompt)
        assert.strictEqual(response, fileLocation)
    })

    it("Returns undefined if no file is selected on first prompt", async function () {
        const selection: any = {label: "Browse for more files..." }
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
        window = new FakeWindow({ dialog: { openSelections: undefined } })
        
        const response = await getFileToUpload(undefined, window, prompt)
        assert.strictEqual(response, undefined)
    })

    it("prompts quick pick with open file option, and browse for more files, returns open file if that option is selected", async function(){
        const selection: any = {label: fileLocation.fsPath }
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
        const response = await getFileToUpload(fileLocation, window, prompt)

        assert.strictEqual(response, fileLocation)
    })

    it("promts quick pick with open file option, and browse for more files, prompts user for other file if that option is selected", async function (){
        const selection: any = {label: "Browse for more files..." }
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
        
        const response = await getFileToUpload(fileLocation, window, prompt)
        assert.strictEqual(response, fileLocation)

    })

    it("returns undefined on second prompt if no file is selected", async function () {
        const selection: any = {label: "Browse for more files..." }
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
        window = new FakeWindow({ dialog: { openSelections: undefined } })
        
        const response = await getFileToUpload(fileLocation, window, prompt)
        assert.strictEqual(response, undefined)
    })
    

})


describe('promptUserForBucket',async function () {
    const fileLocation = vscode.Uri.file('/file.jpg')    

    let s3: S3Client
    let buckets: S3.Bucket[]
    let window: FakeWindow

    beforeEach(function () {
        s3 = mock()
        buckets = [{Name: 'bucket 1'}, {Name: 'bucket 2'}, {Name: 'bucket 3'}]
        window = new FakeWindow({ dialog: { openSelections: [fileLocation] } })
    })

    
    it("Returns selected bucket", async function () {
        when(s3.listAllBuckets()).thenResolve(buckets)
        const selection: any = { 
            label: 'bucket selected',
            bucket: { Name: 'bucket 1' }
        }
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

        const response = await promptUserForBucket(instance(s3), window, prompt)
        assert.deepStrictEqual(response, buckets[0])

    })

    it("Returns back when selected", async function()  {
        when(s3.listAllBuckets()).thenResolve(buckets)
        const selection: any = { 
            label: 'back',
            bucket: undefined
        }
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
        
        const response = await promptUserForBucket(instance(s3), window, prompt)
        assert.strictEqual(response, 'back')
    })

    it("Lets the user create a new bucket", async function () {
        when(s3.listAllBuckets()).thenResolve(buckets)
        const selection: any = { 
            label: 'Create new bucket',
            bucket: undefined
        }
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
        const createBucket: (node?: S3Node, window?: Window, commands?: Commands) => Promise<void> = () => {
            return new Promise((resolve, reject) => {
                reject()
            })
        }
        try {
            await promptUserForBucket(instance(s3), window, prompt, createBucket)
        } catch (e) {

        }
            

    })

    it("Returns cancel when user doesn't select a bucket", async function () {
        when(s3.listAllBuckets()).thenResolve(buckets)

        const prompt: <T extends vscode.QuickPickItem>(opts: {
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
        
        const response = await promptUserForBucket(instance(s3), window, prompt)
        assert.strictEqual(response, 'cancel')
    })

    it("Throws error when it is not possible to list buckets from client", async function () {
        when(s3.listAllBuckets()).thenReject(new Error('Expected failure'))
        
        const window = new FakeWindow({ dialog: { openSelections: [fileLocation] } })
        try{
            await promptUserForBucket(instance(s3), window)
        } catch (e) {
            
        }
        
        assert.ok(window.message.error?.includes('Failed to list buckets from client'))
    })

    
})

describe('uploadFileToS3Command', function () {
    console.log("uploadFileToS3Command Testing initiated ----------------------------------------------------------------")
    const bucketName = 'bucket-name'
    const key = 'file.jpg'
    const sizeBytes = 16
    const fileLocation = vscode.Uri.file('/file.jpg')
    const statFile: FileSizeBytes = _file => sizeBytes

    let s3: S3Client
    let bucket: S3.Bucket

    beforeEach(function () {
        s3 = mock()
        bucket = {
            Name: bucketName
        }
    })

    it("succesfully upload file", async function () {
        when(s3.uploadFile(anything())).thenResolve()

        const window = new FakeWindow({ dialog: { openSelections: [fileLocation] } })
        const outputChannel = new MockOutputChannel()
        await uploadFileToS3Command(fileLocation, bucket, instance(s3), statFile, window, outputChannel)

        //How does this work?
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
            `Uploading file from ${fileLocation} to s3://bucket-name/file.jpg`,
            `Successfully uploaded file s3://bucket-name/file.jpg to bucket-name`,
        ])
    })

    it("cancels the upload in a failed state when an error with the call to s3Client happens", async function () {
        //Error is not being triggered
        when(s3.uploadFile(anything())).thenReject(new Error('Expected failure'))

        const window = new FakeWindow({ dialog: { openSelections: [fileLocation] } })
        const outputChannel = new MockOutputChannel()
        await uploadFileToS3Command(fileLocation, bucket, instance(s3), statFile, window, outputChannel)

        assert.ok(window.message.error?.includes('Failed to upload file'))
    })
    
    
})