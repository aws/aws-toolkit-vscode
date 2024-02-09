/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { copyPathCommand } from './commands/copyPath'
import { createBucketCommand } from './commands/createBucket'
import { createFolderCommand } from './commands/createFolder'
import { deleteBucketCommand } from './commands/deleteBucket'
import { deleteFileCommand } from './commands/deleteFile'
import { downloadFileAsCommand } from './commands/downloadFileAs'
import { presignedURLCommand } from './commands/presignedURL'
import { editFileCommand, openFileReadModeCommand } from './commands/openFile'
import { uploadFileCommand } from './commands/uploadFile'
import { uploadFileToParentCommand } from './commands/uploadFileToParent'
import { S3BucketNode } from './explorer/s3BucketNode'
import { S3FolderNode } from './explorer/s3FolderNode'
import { S3Node } from './explorer/s3Nodes'
import { S3FileNode } from './explorer/s3FileNode'
import { ExtContext } from '../shared/extensions'
import { S3FileViewerManager, s3EditScheme, s3ReadScheme } from './fileViewerManager'
import { VirtualFileSystem } from '../shared/virtualFilesystem'
import { Commands } from '../shared/vscode/commands2'

import * as nls from 'vscode-nls'
import { DefaultS3Client } from '../shared/clients/s3Client'
const localize = nls.loadMessageBundle()

/**
 * Activates S3 components.
 */

export async function activate(ctx: ExtContext): Promise<void> {
    const fs = new VirtualFileSystem(
        localize('AWS.s3.fileViewer.genericError', 'Unable to open S3 file, try reopening from the explorer')
    )
    const manager = new S3FileViewerManager(region => new DefaultS3Client(region), fs)

    ctx.extensionContext.subscriptions.push(manager)
    ctx.extensionContext.subscriptions.push(
        vscode.workspace.registerFileSystemProvider(s3EditScheme, fs, { isCaseSensitive: true }),
        vscode.workspace.registerFileSystemProvider(s3ReadScheme, fs, { isReadonly: true, isCaseSensitive: true }),
        Commands.register('aws.s3.copyPath', async (node: S3FolderNode | S3FileNode) => {
            await copyPathCommand(node)
        }),
        Commands.register('aws.s3.presignedURL', async (node: S3FileNode) => {
            await presignedURLCommand(node)
        }),
        Commands.register('aws.s3.downloadFileAs', async (node: S3FileNode) => {
            await downloadFileAsCommand(node)
        }),
        Commands.register('aws.s3.openFile', async (node: S3FileNode) => {
            await openFileReadModeCommand(node, manager)
        }),
        Commands.register('aws.s3.editFile', async (uriOrNode: vscode.Uri | S3FileNode) => {
            await editFileCommand(uriOrNode, manager)
        }),
        Commands.register(
            { id: 'aws.s3.uploadFile', autoconnect: true },
            async (node?: S3BucketNode | S3FolderNode) => {
                if (!node) {
                    const awsContext = ctx.awsContext
                    const regionCode = awsContext.getCredentialDefaultRegion()
                    const s3Client = new DefaultS3Client(regionCode)
                    const document = vscode.window.activeTextEditor?.document.uri
                    await uploadFileCommand(s3Client, document)
                } else {
                    await uploadFileCommand(node.s3, node)
                }
            }
        ),
        Commands.register('aws.s3.uploadFileToParent', async (node: S3FileNode) => {
            await uploadFileToParentCommand(node)
        }),
        Commands.register('aws.s3.createBucket', async (node: S3Node) => {
            await createBucketCommand(node)
        }),
        Commands.register('aws.s3.createFolder', async (node: S3BucketNode | S3FolderNode) => {
            await createFolderCommand(node)
        }),
        Commands.register('aws.s3.deleteBucket', async (node: S3BucketNode) => {
            await deleteBucketCommand(node)
        }),
        Commands.register('aws.s3.deleteFile', async (node: S3FileNode) => {
            await deleteFileCommand(node)
        })
    )
}
