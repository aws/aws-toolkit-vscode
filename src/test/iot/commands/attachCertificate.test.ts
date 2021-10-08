/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { Iot } from 'aws-sdk'
import { attachCertificateCommand } from '../../../iot/commands/attachCertificate'
import { IotThingFolderNode } from '../../../iot/explorer/iotThingFolderNode'
import { IotThingNode } from '../../../iot/explorer/iotThingNode'
import { IotClient, IotCertificate } from '../../../shared/clients/iotClient'
import { FakeWindow } from '../../shared/vscode/fakeWindow'
import { anything, mock, instance, when, deepEqual, verify } from '../../utilities/mockito'
import { FakeCommands } from '../../shared/vscode/fakeCommands'
import { DataQuickPickItem } from '../../../shared/ui/pickerPrompter'
import { PromptResult } from '../../../shared/ui/prompter'

describe('attachCertCommand', function () {
    const thingName = 'iot-thing'
    let iot: IotClient
    let certs: Iot.Certificate[]
    let thingNode: IotThingNode
    let window: FakeWindow
    let selection: number = 0
    const prompt: (
        certItems: DataQuickPickItem<IotCertificate | undefined>[]
    ) => Promise<PromptResult<IotCertificate | undefined>> = certItems => {
        return new Promise((resolve, reject) => {
            resolve(certItems[selection].data as IotCertificate)
        })
    }

    beforeEach(function () {
        iot = mock()
        thingNode = new IotThingNode({ name: thingName, arn: 'arn' }, {} as IotThingFolderNode, instance(iot))
        certs = [
            { certificateId: 'cert1', certificateArn: 'arn1', status: 'ACTIVE', creationDate: new Date() },
            { certificateId: 'cert2', certificateArn: 'arn2', status: 'INACTIVE', creationDate: new Date() },
            { certificateId: 'cert3', certificateArn: 'arn3', status: 'ACTIVE' },
        ]
        window = new FakeWindow()
    })

    it('attaches selected certificate', async function () {
        selection = 0
        const commands = new FakeCommands()
        when(iot.listCertificates(anything())).thenResolve({ certificates: certs })
        await attachCertificateCommand(thingNode, prompt, window, commands)

        verify(iot.attachThingPrincipal(deepEqual({ thingName, principal: 'arn1' }))).once()

        assert.strictEqual(commands.command, 'aws.refreshAwsExplorerNode')
        assert.deepStrictEqual(commands.args, [thingNode])
    })
})

// describe('getFileToUpload', function () {
//     const fileLocation = vscode.Uri.file('/file.jpg')
//     let window: FakeWindow

//     const selection: any = { label: 'Browse for more files...' }
//     const prompt: <T extends vscode.QuickPickItem>(opts: {
//         picker: vscode.QuickPick<T>
//         onDidTriggerButton?(
//             button: vscode.QuickInputButton,
//             resolve: (value: T[] | PromiseLike<T[] | undefined> | undefined) => void,
//             reject: (reason?: any) => void
//         ): void
//     }) => Promise<T[] | undefined> = () => {
//         return new Promise((resolve, reject) => {
//             resolve([selection])
//         })
//     }

//     beforeEach(function () {
//         window = new FakeWindow({ dialog: { openSelections: [fileLocation] } })
//     })

//     it('directly asks user for file if no active editor', async function () {
//         const response = await getFileToUpload(undefined, window, prompt)
//         assert.strictEqual(response, fileLocation)
//     })

//     it('Returns undefined if no file is selected on first prompt', async function () {
//         window = new FakeWindow({ dialog: { openSelections: undefined } })

//         const response = await getFileToUpload(undefined, window, prompt)
//         assert.strictEqual(response, undefined)
//     })

//     it('opens the current file if a user selects it from the prompt', async function () {
//         const alreadyOpenedUri = vscode.Uri.file('/alreadyOpened.txt')
//         selection.label = alreadyOpenedUri.fsPath

//         const response = await getFileToUpload(alreadyOpenedUri, window, prompt)
//         assert.strictEqual(response, alreadyOpenedUri)
//     })

//     it('opens the file prompt if a user selects to browse for more files', async function () {
//         selection.label = 'Browse for more files...'

//         const response = await getFileToUpload(fileLocation, window, prompt)
//         assert.strictEqual(response, fileLocation)
//     })

//     it('returns undefined if the user does not select a file through the file browser', async function () {
//         selection.label = 'Browse for more files...'
//         window = new FakeWindow({ dialog: { openSelections: undefined } })

//         const response = await getFileToUpload(fileLocation, window, prompt)

//         assert.strictEqual(response, undefined)
//     })
// })

// describe('promptUserForBucket', async function () {
//     const fileLocation = vscode.Uri.file('/file.jpg')

//     let s3: S3Client
//     let buckets: S3.Bucket[]
//     let window: FakeWindow

//     const promptUndef: <T extends vscode.QuickPickItem>(opts: {
//         picker: vscode.QuickPick<T>
//         onDidTriggerButton?(
//             button: vscode.QuickInputButton,
//             resolve: (value: T[] | PromiseLike<T[] | undefined> | undefined) => void,
//             reject: (reason?: any) => void
//         ): void
//     }) => Promise<T[] | undefined> = () => {
//         return new Promise((resolve, reject) => {
//             resolve(undefined)
//         })
//     }
//     const selection: any = {
//         label: 'bucket selected',
//         bucket: { Name: 'bucket 1' },
//     }
//     const promptSelect: <T extends vscode.QuickPickItem>(opts: {
//         picker: vscode.QuickPick<T>
//         onDidTriggerButton?(
//             button: vscode.QuickInputButton,
//             resolve: (value: T[] | PromiseLike<T[] | undefined> | undefined) => void,
//             reject: (reason?: any) => void
//         ): void
//     }) => Promise<T[] | undefined> = () => {
//         return new Promise((resolve, reject) => {
//             resolve([selection])
//         })
//     }

//     beforeEach(function () {
//         s3 = mock()
//         buckets = [{ Name: 'bucket 1' }, { Name: 'bucket 2' }, { Name: 'bucket 3' }]
//         window = new FakeWindow({ dialog: { openSelections: [fileLocation] } })
//     })

//     it('Returns selected bucket', async function () {
//         when(s3.listAllBuckets()).thenResolve(buckets)

//         const response = await promptUserForBucket(instance(s3), window, promptSelect)
//         assert.deepStrictEqual(response, buckets[0])
//     })

//     it('Returns "back" when selected', async function () {
//         when(s3.listAllBuckets()).thenResolve(buckets)

//         selection.label = 'back'
//         selection.bucket = undefined

//         const response = await promptUserForBucket(instance(s3), window, promptSelect)
//         assert.strictEqual(response, 'back')
//     })

//     it('Lets the user create a new bucket', async function () {
//         when(s3.listAllBuckets()).thenResolve(buckets)

//         selection.label = 'Create new bucket'
//         selection.bucket = undefined

//         const createBucket: (node?: S3Node, window?: Window, commands?: Commands) => Promise<void> = () => {
//             window.showErrorMessage('Error expected')
//             throw new Error('Error expected')
//         }
//         try {
//             await promptUserForBucket(instance(s3), window, promptSelect, createBucket)
//             assert.fail()
//         } catch (e) {
//             assert.ok(window.message.error?.includes('Error expected'))
//         }
//     })

//     it('Returns "cancel" when user doesn\'t select a bucket', async function () {
//         when(s3.listAllBuckets()).thenResolve(buckets)

//         const response = await promptUserForBucket(instance(s3), window, promptUndef)
//         assert.strictEqual(response, 'cancel')
//     })

//     it('Throws error when it is not possible to list buckets from client', async function () {
//         when(s3.listAllBuckets()).thenReject(new Error('Expected failure'))

//         const window = new FakeWindow({ dialog: { openSelections: [fileLocation] } })
//         try {
//             await promptUserForBucket(instance(s3), window)
//             assert.fail() // fails if promptUserForBucket does not throw
//         } catch (e) {
//             assert.ok(window.message.error?.includes('Failed to list buckets from client'))
//         }
//     })
// })
