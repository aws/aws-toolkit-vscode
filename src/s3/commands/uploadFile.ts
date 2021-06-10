/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

//import * as nls from 'vscode-nls'

//const localize = nls.loadMessageBundle()

import { S3 } from 'aws-sdk'
import * as path from 'path'
import { statSync } from 'fs'
import * as vscode from 'vscode'
import { ext } from '../../shared/extensionGlobals'
import { getLogger } from '../../shared/logger'
import { S3BucketNode } from '../explorer/s3BucketNode'
import { S3FolderNode } from '../explorer/s3FolderNode'
import { Commands } from '../../shared/vscode/commands'
import { Window } from '../../shared/vscode/window'
import * as telemetry from '../../shared/telemetry/telemetry'
import { readablePath } from '../util'
import { progressReporter } from '../progressReporter'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { showErrorWithLogs, showOutputMessage } from '../../shared/utilities/messages'
import { TextEditor } from 'vscode'
import { createQuickPick, promptUser, verifySinglePickerOutput } from '../../shared/ui/picker'
//import { promptUser } from '../../shared/ui/input'
import { addCodiconToString } from '../../shared/utilities/textUtilities'
import AWS = require('aws-sdk')
import { S3Client } from '../../shared/clients/s3Client'
import { Workspace } from '../../shared/vscode/workspace'
import { extensionSettingsPrefix } from '../../shared/constants'
import { validateBucketName } from '../util'


export interface FileSizeBytes {
    /**
     * Returns the file size in bytes.
     */
    (file: vscode.Uri): number
}

/**
 * Uploads a file to the bucket or folder represented by the given node.
 *
 * Prompts the user for the file location.
 * Shows the output channel with "upload started" message.
 * Uploads the file (showing a progress bar).
 * Shows the output channel with "upload completed" message.
 * Refreshes the node.
 *
 * Node that the node is reset to displaying its first page of results.
 * The file that is uploaded won't necessary fall on the first page.
 * The user may need to load more pages to see the uploaded file reflected in the tree.
 */
export async function uploadFileCommand(
    node: S3BucketNode | S3FolderNode,
    fileSizeBytes: FileSizeBytes = statFile,
    window = Window.vscode(),
    commands = Commands.vscode(),
    outputChannel = ext.outputChannel
): Promise<void> {
    getLogger().debug('UploadFile called for %O', node)

    const fileLocation = await promptForFileLocation(window)
    if (!fileLocation) {
        getLogger().info('UploadFile cancelled')
        telemetry.recordS3UploadObject({ result: 'Cancelled' })
        return
    }

    const fileName = path.basename(fileLocation.fsPath)
    const key = node.path + fileName
    const destinationPath = readablePath({ bucket: node.bucket, path: key })
    try {
        showOutputMessage(`Uploading file from ${fileLocation} to ${destinationPath}`, outputChannel)

        //await uploadWithProgress({ node, key, fileLocation, fileSizeBytes: fileSizeBytes(fileLocation), window })
        await uploadWithProgress({ 
            bucketName: node.bucket.name,
            key: key,
            fileLocation: fileLocation,
            fileSizeBytes: fileSizeBytes(fileLocation),
            s3Client: node.s3,
            window: window
        })
        showOutputMessage(`Successfully uploaded file ${destinationPath}`, outputChannel)
        telemetry.recordS3UploadObject({ result: 'Succeeded' })
    } catch (e) {
        getLogger().error(`Failed to upload file from ${fileLocation} to ${destinationPath}: %O`, e)
        showErrorWithLogs(localize('AWS.s3.uploadFile.error.general', 'Failed to upload file {0}', fileName), window)
        telemetry.recordS3UploadObject({ result: 'Failed' })
    }

    await refreshNode(node, commands)
}

async function promptForFileLocation(window: Window): Promise<vscode.Uri | undefined> {
    const fileLocations = await window.showOpenDialog({
        openLabel: localize('AWS.s3.uploadFile.openButton', 'Upload'),
    })

    if (!fileLocations || fileLocations.length == 0) {
        return undefined
    }

    return fileLocations[0]
}

function statFile(file: vscode.Uri) {
    return statSync(file.fsPath).size
}

async function refreshNode(node: S3BucketNode | S3FolderNode, commands: Commands): Promise<void> {
    node.clearChildren()
    return commands.execute('aws.refreshAwsExplorerNode', node)
}

async function uploadWithProgress({
    bucketName,
    key,
    fileLocation,
    fileSizeBytes,
    s3Client,
    window
}:
    {
    bucketName: string,
    key: string,
    fileLocation: vscode.Uri,
    fileSizeBytes: number,
    s3Client: S3Client,
    window: Window
}): Promise<void>{
    return window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: localize('AWS.s3.uploadFile.progressTitle', 'Uploading {0}...', path.basename(fileLocation.fsPath)),
        },
        progress => {
            return s3Client.uploadFile({
                bucketName: bucketName,
                key: key,
                fileLocation,
                progressListener: progressReporter({ progress, totalBytes: fileSizeBytes }),
            })
        }
    )
}

interface BucketQuickPickItem extends vscode.QuickPickItem {
    bucket: S3.Bucket | undefined
}

/**
 * 
 * @returns 
 */
async function promptUserForBucket(): Promise<S3.Bucket | undefined> {
    let regionCode = Workspace.vscode().getConfiguration(extensionSettingsPrefix).get<string>('s3.defaultRegion')?? "us-east-1" //TODO:: decide how to get the regionCode!!
    const s3client = ext.toolkitClientBuilder.createS3Client(regionCode)
    const window = Window.vscode()
    const allBuckets: S3.Bucket[] = await s3client.listAllBuckets()
    const s3Buckets = allBuckets.filter(bucket => {
        return bucket && bucket.Name
    }) as S3.Bucket[]

    
    const createNewBucket: BucketQuickPickItem = {
        label: localize('AWS.command.s3.createBucket',"Create new bucket"),
        bucket: undefined
    }
    const bucketItems: BucketQuickPickItem[] = s3Buckets.map(bucket => {
        return { 
            label: bucket.Name!,
            bucket
        }
    })

    const picker = createQuickPick({
        options: {
            canPickMany: false,
            ignoreFocusOut: true,
            title: localize('AWS.message.selectBucket','Select S3 bucket to upload to'),//localize('AWS.lambda.upload.title', 'Select Upload Type'),
            step: 2,
            totalSteps: 2,
        },
        items: [...bucketItems, createNewBucket],
        buttons: [vscode.QuickInputButtons.Back]
    })
    const response = verifySinglePickerOutput(await promptUser({
        picker: picker,
        onDidTriggerButton: (button, resolve, reject) => {
            if (button === vscode.QuickInputButtons.Back) {
                resolve([{
                    label: "back",
                    bucket: undefined
                }])
            }

        },
    })) 

    if (!response) {
        return undefined
    }

    if (!response.bucket) {
        if (response.label === 'back') {
            uploadFilePaletteCommand()
        }
        if (response.label === 'Create new bucket') {
            getLogger().debug('CreateBucket called for: %O', s3client)

            const bucketName = await window.showInputBox({
                prompt: localize('AWS.s3.createBucket.prompt', 'Enter a new bucket name'),
                placeHolder: localize('AWS.s3.createBucket.placeHolder', 'Bucket Name'),
                validateInput: validateBucketName,
            })

            if (!bucketName) {
                getLogger().info('CreateBucket cancelled')
                telemetry.recordS3CreateBucket({ result: 'Cancelled' })
                return undefined
            }

            getLogger().info(`Creating bucket: ${bucketName}`)
            try {
                const bucket = await s3client.createBucket({ bucketName })

                getLogger().info('Created bucket: %O', bucket)
                window.showInformationMessage(localize('AWS.s3.createBucket.success', 'Created bucket: {0}', bucketName))
                telemetry.recordS3CreateBucket({ result: 'Succeeded' })
                return { Name: bucket.bucket.name }
            } catch (e) {
                getLogger().error(`Failed to create bucket ${bucketName}: %O`, e)
                showErrorWithLogs(
                    localize('AWS.s3.createBucket.error.general', 'Failed to create bucket: {0}', bucketName),
                    Window.vscode()
                )
                telemetry.recordS3CreateBucket({ result: 'Failed' })
                return undefined
            }
        }
    } else {
        return response.bucket
    }
    return undefined
}

export async function uploadFilePaletteCommand(
    fileSizeBytes: FileSizeBytes = statFile,
    window = Window.vscode(),
    outputChannel = ext.outputChannel
): Promise<void>{

    //1 step: get the file that is currently opened in the editor
    const activeEditor: TextEditor | undefined = vscode.window.activeTextEditor // returns an object of type TextEditor | undef 
    const document = activeEditor?.document
    let selectAnotherFile = false
    let fileLocation: vscode.Uri | undefined


    //2 step: prompt the quick picker so that user can specify if they want the
    //current file or select other file from their system
    //there is 2 possibilities
    //there is an active editor with a file (document) open, then show the quickpick with the option 
    //to browse for more files
    //or there is no active editor, no file is open
    if (!document) {
        fileLocation = await promptForFileLocation(Window.vscode())
    } 
    else {
        fileLocation = document.uri
        const fileNameToDisplay = path.basename(fileLocation.fsPath)

        //Now, ask the user with quickpicker to select file to use

        //crete quick pick using picker.createQuickPick(options, items, buttons) that returns a QuickPick
        const fileOption : vscode.QuickPickItem = { 
            label: addCodiconToString('file', fileNameToDisplay) //TODO:: change parameters to correct ones
        }
        const selectMore: vscode.QuickPickItem = {
            label: "Browse for more files..."
        }

        const picker = createQuickPick({
            options: {
                canPickMany: false,
                ignoreFocusOut: true,
                title: localize('AWS.message.selectFileUpload', 'Couldnt find it'), //not finding this wtf
                step: 1,
                totalSteps: 2,
            },
            items: [fileOption, selectMore],
            buttons: [vscode.QuickInputButtons.Back]
        })

        //use the quickPick item above with promptUser(picker, onDidtTriggerButton) to show the quickpick
        const response = verifySinglePickerOutput(await promptUser({
            picker: picker,
            onDidTriggerButton: (button, resolve, reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                }
            },
        }))

        if(!response){
            getLogger().info('UploadFile cancelled')
            telemetry.recordS3UploadObject({ result: 'Cancelled' })
            return
        }

        if (response!.label === 'Browse for more files...') {
            selectAnotherFile = true
        }

    //2.1 step: if user wants other file prompt the file selector to allow user to select wanted file
        if (selectAnotherFile) {
            fileLocation = await promptForFileLocation(Window.vscode())
        }
    }
    //if at this point the file location is undefined, something went wrong, cancel the upload
    if (!fileLocation) {
        getLogger().info('UploadFile cancelled')
        telemetry.recordS3UploadObject({ result: 'Cancelled' })
        return
    }

    
    //3 step: get and display the user's available buckets --> goal is to get node: S3BucketNode | S3FolderNode
    //const node: S3BucketNode | S3FolderNode = promptUserForBucket()
    const bucket: S3.Bucket | undefined = await promptUserForBucket()
    if(!bucket){
        getLogger().info('No bucket selected, cancelling upload')
        telemetry.recordS3UploadObject({ result: 'Cancelled' })
        return
    }
    
    const fileName = path.basename(fileLocation.fsPath)
    const key = '' + fileName
    const destinationPath = readablePath({ bucket: {name: bucket.Name!}, path: key })
    const regionCode = Workspace.vscode().getConfiguration(extensionSettingsPrefix).get<string>('s3.defaultRegion')?? "us-east-1"
    //4 step: after user selects bucket, upload file to that bucket and show progress
    try {
        showOutputMessage(`Uploading file from ${fileLocation} to ${destinationPath}`, outputChannel)
        const request = {
            bucketName: bucket.Name!,
            key: key,
            fileLocation: fileLocation,
            fileSizeBytes: fileSizeBytes(fileLocation),
            s3Client: ext.toolkitClientBuilder.createS3Client(regionCode),
            window: window
        }

        await uploadWithProgress(request)
        showOutputMessage(`Successfully uploaded file ${destinationPath} to ${bucket.Name!}`, outputChannel)
        telemetry.recordS3UploadObject({ result: 'Succeeded' })

    } catch (e) {
        getLogger().error(`Failed to upload file from ${fileLocation} to ${destinationPath}: %O`, e)
        showErrorWithLogs(localize('AWS.s3.uploadFile.error.general', 'Failed to upload file {0}', fileName), window)
        telemetry.recordS3UploadObject({ result: 'Failed' })
    }
    //await refreshNode(bucket, commands)
    return
}
