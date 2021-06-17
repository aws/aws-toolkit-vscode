/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as telemetry from '../shared/telemetry/telemetry'
import * as path from 'path'
import { copyPathCommand } from './commands/copyPath'
import { createBucketCommand } from './commands/createBucket'
import { createFolderCommand } from './commands/createFolder'
import { deleteBucketCommand } from './commands/deleteBucket'
import { deleteFileCommand } from './commands/deleteFile'
import { downloadFileAsCommand } from './commands/downloadFileAs'
import { uploadFileCommand, getFileToUpload, promptUserForBucket } from './commands/uploadFile'
import { uploadFileToParentCommand } from './commands/uploadFileToParent'
import { S3BucketNode } from './explorer/s3BucketNode'
import { S3FolderNode } from './explorer/s3FolderNode'
import { S3Node } from './explorer/s3Nodes'
import { S3FileNode } from './explorer/s3FileNode'
import { getLogger } from '../shared/logger'
import { S3 } from 'aws-sdk'
import { ext } from '../shared/extensionGlobals'
import { Workspace } from '../shared/vscode/workspace'
import { extensionSettingsPrefix } from '../shared/constants'
/**
 * Activates S3 components.
 */
export async function activate(extensionContext: vscode.ExtensionContext): Promise<void> {
    extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.s3.copyPath', async (node: S3FolderNode | S3FileNode) => {
            await copyPathCommand(node)
        }),
        vscode.commands.registerCommand('aws.s3.downloadFileAs', async (node: S3FileNode) => {
            await downloadFileAsCommand(node)
        }),
        vscode.commands.registerCommand('aws.s3.uploadFile', async (node: S3BucketNode | S3FolderNode) => {
            const fileLocation = await getFileToUpload()
            if (!fileLocation) {
                getLogger().info('UploadFile cancelled')
                telemetry.recordS3UploadObject({ result: 'Cancelled' })
                return
            }
            const key = node.path + path.basename(fileLocation.fsPath)
            const bucket:S3.Bucket = { Name: node.bucket.name }
            await uploadFileCommand(fileLocation, key, bucket, node.s3)
        }),
        vscode.commands.registerCommand('aws.s3.uploadFileToS3', async () => {
            while (true) {
                const editor = vscode.window.activeTextEditor
                const document = editor?.document.uri
                const file = await getFileToUpload(document)
                if (file) {
                    try{
                        const regionCode = Workspace.vscode().getConfiguration(extensionSettingsPrefix).get<string>('s3.defaultRegion')?? 'us-east-1'
                        const s3Client = ext.toolkitClientBuilder.createS3Client(regionCode) 
                        
                        const bucketResponse = await promptUserForBucket(s3Client)
                        if (bucketResponse === 'back'){
                            continue
                        }
                        if(bucketResponse == 'cancel'){
                            getLogger().info('No bucket selected, cancelling upload')
                            telemetry.recordS3UploadObject({ result: 'Cancelled' })
                            return
                        }
                        
                        const bucket = bucketResponse as S3.Bucket
                        const key = '' + path.basename(file.fsPath)
                        return await uploadFileCommand(file, key, bucket, s3Client)
                    } catch (e) {
                        
                        return
                    }
                } else {
                    //if file is undefined, means the back button was pressed(there is no step before) or no file was selected
                    //thus break the loop of the 'wizard'
                    getLogger().info('UploadFile cancelled')
                    telemetry.recordS3UploadObject({ result: 'Cancelled' })
                    return
                }
            }
            
            
        }),
        vscode.commands.registerCommand('aws.s3.uploadFileToParent', async (node: S3FileNode) => {
            await uploadFileToParentCommand(node)
        }),
        vscode.commands.registerCommand('aws.s3.createBucket', async (node: S3Node) => {
            await createBucketCommand(node)
        }),
        vscode.commands.registerCommand('aws.s3.createFolder', async (node: S3BucketNode | S3FolderNode) => {
            await createFolderCommand(node)
        }),
        vscode.commands.registerCommand('aws.s3.deleteBucket', async (node: S3BucketNode) => {
            await deleteBucketCommand(node)
        }),
        vscode.commands.registerCommand('aws.s3.deleteFile', async (node: S3FileNode) => {
            await deleteFileCommand(node)
        })
    )
}
