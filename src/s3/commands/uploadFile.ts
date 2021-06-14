/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */


import { S3 } from 'aws-sdk'
import * as path from 'path'
import { statSync } from 'fs'
import * as vscode from 'vscode'
import { ext } from '../../shared/extensionGlobals'
import { getLogger } from '../../shared/logger'
import { S3BucketNode } from '../explorer/s3BucketNode'
import { S3FolderNode } from '../explorer/s3FolderNode'
import { S3Node } from '../explorer/s3Nodes'
import { Commands } from '../../shared/vscode/commands'
import { Window } from '../../shared/vscode/window'
import * as telemetry from '../../shared/telemetry/telemetry'
import { readablePath } from '../util'
import { progressReporter } from '../progressReporter'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { showErrorWithLogs, showOutputMessage } from '../../shared/utilities/messages'
import { createQuickPick, promptUser, verifySinglePickerOutput } from '../../shared/ui/picker'
import { addCodiconToString } from '../../shared/utilities/textUtilities'
import { S3Client } from '../../shared/clients/s3Client'
import { createBucketCommand } from './createBucket'




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
 * Will display a quick pick with the list of all buckets owned by the user.
 * 
 * @returns Bucket selected by the user, undefined if no bucket was selected or the quick pick was cancelled.
 * 
 * @throws Error if there is an error calling s3
 */
export async function promptUserForBucket(
    s3client: S3Client,
    window = Window.vscode(),
    promptUserFunction = promptUser,
    createBucket = createBucketCommand,
): Promise<S3.Bucket | string> {
    let allBuckets: S3.Bucket[]
    try{
        allBuckets = await s3client.listAllBuckets()
    } catch (e) {
        getLogger().error('Failed to list buckets from client', e)
        showErrorWithLogs('Failed to list buckets from client', window)
        telemetry.recordS3UploadObject({ result: 'Failed' })
        throw new Error('Failed to list buckets from client')
    }
    
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
            title: localize('AWS.message.selectBucket','Select an S3 bucket to upload to'),
            step: 2,
            totalSteps: 2,
        },
        items: [...bucketItems, createNewBucket],
        buttons: [vscode.QuickInputButtons.Back]
    })
    const response = verifySinglePickerOutput(await promptUserFunction({
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
        return 'cancel'
    }

    if (!response.bucket) {
        if (response.label === 'back') {
            return response.label
        }
        if (response.label === 'Create new bucket') {
            const s3Node = new S3Node(s3client)
            await createBucket(s3Node, window, Commands.vscode())
            return promptUserForBucket(s3client)
        }
    } else {
        return response.bucket
    }
    return 'cancel'
}

/**
 * Gets the file open in the current editor
 * Asks the user to browse for more files
 * If no file is open it prompts the user to select file
 * 
 * @param editor 
 * @param document 
 * @returns file selected by the user
 */
export async function getFileToUpload(
    document?: vscode.Uri,
    window = Window.vscode(),
    promptUserFunction = promptUser
): Promise<vscode.Uri| undefined> {
    
    let fileLocation: vscode.Uri | undefined

    if (!document) {
        fileLocation = await promptForFileLocation(window)
    } 
    else {
        fileLocation = document
        const fileNameToDisplay = path.basename(fileLocation.fsPath)

        const fileOption : vscode.QuickPickItem = { 
            label: addCodiconToString('file', fileNameToDisplay) 
        }
        const selectMore: vscode.QuickPickItem = {
            label: "Browse for more files..."
        }

        const picker = createQuickPick({
            options: {
                canPickMany: false,
                ignoreFocusOut: true,
                title: localize('AWS.message.selectFileUpload', 'Select a file to upload'), 
                step: 1,
                totalSteps: 2,
            },
            items: [fileOption, selectMore],
            buttons: [vscode.QuickInputButtons.Back]
        })

        
        const response = verifySinglePickerOutput(await promptUserFunction({
            picker: picker,
            onDidTriggerButton: (button, resolve, reject) => {
                if (button === vscode.QuickInputButtons.Back) {
                    resolve(undefined)
                }
            },
        }))

        if(!response){
            return undefined
        }

        if (response.label === 'Browse for more files...') {
            fileLocation = await promptForFileLocation(window)
        }

    }
    
    if (!fileLocation) {
        return undefined
    }
    return fileLocation
}

/**
 * Uploads given file to a bucket
 * 
 * @param fileLocation file uri to be uploaded
 * @param bucket to upload file to
 * @param fileSizeBytes 
 * @param window 
 * @param outputChannel 
 * 
 */

export async function uploadFileToS3Command(
    fileLocation: vscode.Uri,
    bucket: S3.Bucket,
    s3Client: S3Client,
    fileSizeBytes: FileSizeBytes = statFile,
    window = Window.vscode(),
    outputChannel = ext.outputChannel,
): Promise<void>{
    
    const fileName = path.basename(fileLocation.fsPath)
    const key = '' + fileName
    const destinationPath = readablePath({ bucket: {name: bucket.Name!}, path: key })
    

    try {
        showOutputMessage(`Uploading file from ${fileLocation} to ${destinationPath}`, outputChannel)
        const request = {
            bucketName: bucket.Name!,
            key: key,
            fileLocation: fileLocation,
            fileSizeBytes: fileSizeBytes(fileLocation),
            s3Client,
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
    
}
