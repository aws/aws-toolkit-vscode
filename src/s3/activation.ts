/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { copyPathCommand } from './commands/copyPath'
import { createBucketCommand } from './commands/createBucket'
import { createFolderCommand } from './commands/createFolder'
import { deleteBucketCommand } from './commands/deleteBucket'
import { deleteFileCommand } from './commands/deleteFile'
import { downloadFileAsCommand } from './commands/downloadFileAs'
import { uploadFileCommand } from './commands/uploadFile'
import { uploadFileToParentCommand } from './commands/uploadFileToParent'
import { S3BucketNode } from './explorer/s3BucketNode'
import { S3FolderNode } from './explorer/s3FolderNode'
import { S3Node } from './explorer/s3Nodes'
import { S3FileNode } from './explorer/s3FileNode'
import { ext } from '../shared/extensionGlobals'
import { ExtContext } from '../shared/extensions'

/**
 * Activates S3 components.
 */
export async function activate(ctx: ExtContext): Promise<void> {
    ctx.extensionContext.subscriptions.push(
        vscode.commands.registerCommand('aws.s3.copyPath', async (node: S3FolderNode | S3FileNode) => {
            await copyPathCommand(node)
        }),
        vscode.commands.registerCommand('aws.s3.downloadFileAs', async (node: S3FileNode) => {
            await downloadFileAsCommand(node)
        }),
        vscode.commands.registerCommand('aws.s3.uploadFile', async (node: S3BucketNode | S3FolderNode) => {
            if (!node) {
                const awsContext = ctx.awsContext
                const regionCode = awsContext.getCredentialDefaultRegion()
                const s3Client = ext.toolkitClientBuilder.createS3Client(regionCode)
                const document = vscode.window.activeTextEditor?.document.uri
                await uploadFileCommand(s3Client, document)
            } else {
                await uploadFileCommand(node.s3, node)
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
