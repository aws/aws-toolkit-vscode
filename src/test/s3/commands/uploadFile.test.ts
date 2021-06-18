/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
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


describe('uploadFileCommand', function () {
   
    const bucketName = 'bucket-name'
    const key = 'file.jpg'
    const sizeBytes = 16
    const fileLocation = vscode.Uri.file('/file.jpg')
    const statFile: FileSizeBytes = _file => sizeBytes
    let outputChannel: MockOutputChannel
    let s3: S3Client
    let bucketNode: S3BucketNode
    let window: FakeWindow
    let getBucket: (s3client:S3Client, window?: Window) => Promise<S3.Bucket | string >
    let getFile: (document?: vscode.Uri, window?: Window) => Promise<vscode.Uri | undefined >
    
    beforeEach(function () {
        s3 = mock()
        bucketNode = new S3BucketNode(
            { name: bucketName, region: 'region', arn: 'arn' },
            new S3Node(instance(s3)),
            instance(s3)
        )
        window = new FakeWindow({ dialog: { openSelections: [fileLocation] } })
        outputChannel = new MockOutputChannel()
    })

    describe('when it gets the node parameter', async function() {
        this.beforeEach(function () {
            outputChannel = new MockOutputChannel()
            s3 = mock()
            bucketNode = new S3BucketNode(
                { name: bucketName, region: 'region', arn: 'arn' },
                new S3Node(instance(s3)),
                instance(s3)
            )
            window = new FakeWindow({ dialog: { openSelections: [fileLocation] } })
        })
       
        it("asks for the file location, then uploads, display success message if aplicable", async function() {
            when(s3.uploadFile(anything())).thenResolve()
            
            window = new FakeWindow({ dialog: { openSelections: [fileLocation] } })
            
            
            getFile = (document, window) => {
                return new Promise((resolve, reject) => {
                    resolve(fileLocation)
                })
            }
            
            
            await uploadFileCommand(instance(s3), bucketNode, fileLocation, statFile, undefined, getFile, window, outputChannel)
            
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
        
        it("if user don't select a file in the prompt, it cancels and displays cancelled message", async function() {
            window = new FakeWindow({ dialog: { openSelections: undefined } })
            
            getFile = (document, window) => {
                return new Promise((resolve, reject) => {
                    resolve(undefined)
                })
            } 
            
            await uploadFileCommand(instance(s3), bucketNode, fileLocation, statFile, undefined, getFile, window, outputChannel)
            assert.deepStrictEqual(outputChannel.lines, [
                'No file selected, cancelling upload',
            ])
        })
    })
    
    describe('when it doesn\'t get the node parameter', async function () {
        

        this.beforeEach(function (){
            outputChannel = new MockOutputChannel()
            s3 = mock()
            window = new FakeWindow({ dialog: { openSelections: [fileLocation] } })
            getFile = (document, window) => {
                return new Promise((resolve, reject) => {
                    resolve(fileLocation)
                })
            }
    
            getBucket = (s3Client) => {
                return new Promise((resolve, reject) => {
                    resolve({ Name: bucketName })
                })
            }
        })

        it('prompts the user for file, then for bucket, if both aren\'t undefined, uploads', async function () {
            when(s3.uploadFile(anything())).thenResolve()

            await uploadFileCommand(instance(s3), undefined, undefined, statFile, getBucket, getFile, window, outputChannel)
            assert.deepStrictEqual(outputChannel.lines, [
                `Uploading file from ${fileLocation} to s3://bucket-name/file.jpg`,
                `Successfully uploaded file s3://bucket-name/file.jpg to bucket-name`,
            ])
        })

        it('prompts the user for file, then for bucket, if bucket is not selected, it cancels the upload', async function () {
            getBucket = (s3Client) => {
                return new Promise((resolve, reject) => {
                    resolve('cancel')
                })
            }

            await uploadFileCommand(instance(s3), undefined, undefined, statFile, getBucket, getFile, window, outputChannel)
            assert.deepStrictEqual(outputChannel.lines, ['No bucket selected, cancelling upload'] )
        })

        it('prompts the user for file, if file not selected, it cancels the upload', async function () {
            getFile = (document, window) => {
                return new Promise((resolve, reject) => {
                    resolve(undefined)
                })
            }

            await uploadFileCommand(instance(s3), undefined, undefined, statFile, getBucket, getFile, window, outputChannel)
            assert.deepStrictEqual(outputChannel.lines, ['No file selected, cancelling upload'] )
        })
        
    })

    getFile = (document, window) => {
        return new Promise((resolve, reject) => {
            resolve(fileLocation)
        })
    }

    getBucket = (s3Client) => {
        return new Promise((resolve, reject) => {
            resolve({ Name: bucketName })
        })
    }

    it("succesfully upload file", async function () {
        when(s3.uploadFile(anything())).thenResolve()

        window = new FakeWindow({ dialog: { openSelections: [fileLocation] } })
        
        await uploadFileCommand(instance(s3), undefined, fileLocation, statFile, getBucket, getFile, window, outputChannel)

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
        when(s3.uploadFile(anything())).thenReject(new Error('Expected failure'))

        
        const window = new FakeWindow({ dialog: { openSelections: [fileLocation] } })
        const outputChannel = new MockOutputChannel()
        await uploadFileCommand(instance(s3), undefined, fileLocation, statFile, getBucket, getFile, window, outputChannel)
         
        assert.ok(window.message.error?.includes('Failed to upload file'))
    })
    
    
})

describe('getFileToUpload', function () {
    const fileLocation = vscode.Uri.file('/file.jpg')    
    let window: FakeWindow

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

    beforeEach(function () {
        window = new FakeWindow({ dialog: { openSelections: [fileLocation] } })       
    })
    
    it("directly asks user for file if no active editor", async function () {
        
        const response = await getFileToUpload(undefined, window, prompt)
        assert.strictEqual(response, fileLocation)
    })

    it("Returns undefined if no file is selected on first prompt", async function () {
        window = new FakeWindow({ dialog: { openSelections: undefined } })
        
        const response = await getFileToUpload(undefined, window, prompt)
        assert.strictEqual(response, undefined)
    })

    it("prompts quick pick with open file option, and browse for more files, returns open file if that option is selected", async function(){
        selection.label = fileLocation.fsPath
        const response = await getFileToUpload(fileLocation, window, prompt)

        assert.strictEqual(response, fileLocation)
    })

    it("prompts quick pick with open file option, and browse for more files, prompts user for other file if that option is selected", async function (){
        selection.label = "Browse for more files..."
        
        const response = await getFileToUpload(fileLocation, window, prompt)
        assert.strictEqual(response, fileLocation)

    })

    it("returns undefined on second prompt if no file is selected", async function () {
        selection.label = "Browse for more files..." 
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
        bucket: { Name: 'bucket 1' }
    }
    const promptSelec: <T extends vscode.QuickPickItem>(opts: {
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
        buckets = [{Name: 'bucket 1'}, {Name: 'bucket 2'}, {Name: 'bucket 3'}]
        window = new FakeWindow({ dialog: { openSelections: [fileLocation] } })
    })

    
    it("Returns selected bucket", async function () {
        when(s3.listAllBuckets()).thenResolve(buckets)

        const response = await promptUserForBucket(instance(s3), window, promptSelec)
        assert.deepStrictEqual(response, buckets[0])

    })

    it("Returns back when selected", async function()  {
        when(s3.listAllBuckets()).thenResolve(buckets)

        selection.label = 'back'
        selection.bucket = undefined
        
        const response = await promptUserForBucket(instance(s3), window, promptSelec)
        assert.strictEqual(response, 'back')
    })

    it("Lets the user create a new bucket", async function () {
        when(s3.listAllBuckets()).thenResolve(buckets)

        selection.label = 'Create new bucket'
        selection.bucket = undefined

        const createBucket: (node?: S3Node, window?: Window, commands?: Commands) => Promise<void> = () => {
            return new Promise((resolve, reject) => {
                reject()
            })
        }
        try {
            await promptUserForBucket(instance(s3), window, promptSelec, createBucket)
        } catch (e) {

        }
    })

    it("Returns cancel when user doesn't select a bucket", async function () {
        when(s3.listAllBuckets()).thenResolve(buckets)
        
        const response = await promptUserForBucket(instance(s3), window, promptUndef)
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
