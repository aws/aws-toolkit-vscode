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
import { presignedURLCommand } from './commands/presignedURL'
import { openFileEditModeCommand, openFileReadModeCommand } from './commands/openFile'
import { uploadFileCommand } from './commands/uploadFile'
import { uploadFileToParentCommand } from './commands/uploadFileToParent'
import { S3BucketNode } from './explorer/s3BucketNode'
import { S3FolderNode } from './explorer/s3FolderNode'
import { S3Node } from './explorer/s3Nodes'
import { S3FileNode } from './explorer/s3FileNode'
import { ExtContext } from '../shared/extensions'
import { S3FileViewerManager, S3_EDIT_SCHEME, S3_READ_SCHEME } from './fileViewerManager'
import { VirualFileSystem } from '../shared/virtualFilesystem'
import globals from '../shared/extensionGlobals'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

/**
 * Activates S3 components.
 */

export async function activate(ctx: ExtContext): Promise<void> {
    const fs = new VirualFileSystem(
        localize('AWS.s3.fileViewer.genericError', 'Unable to open S3 file, try reopening from the explorer.')
    )
    const manager = new S3FileViewerManager(region => globals.toolkitClientBuilder.createS3Client(region), fs)

    ctx.extensionContext.subscriptions.push(manager)
    ctx.extensionContext.subscriptions.push(
        vscode.workspace.registerFileSystemProvider(S3_EDIT_SCHEME, fs),
        vscode.workspace.registerFileSystemProvider(S3_READ_SCHEME, fs, { isReadonly: true }),
        vscode.commands.registerCommand('aws.s3.copyPath', async (node: S3FolderNode | S3FileNode) => {
            await copyPathCommand(node)
        }),
        vscode.commands.registerCommand('aws.s3.presignedURL', async (node: S3FileNode) => {
            await presignedURLCommand(node)
        }),
        vscode.commands.registerCommand('aws.s3.downloadFileAs', async (node: S3FileNode) => {
            await downloadFileAsCommand(node)
        }),
        vscode.commands.registerCommand('aws.s3.openFile', async (node: S3FileNode) => {
            await openFileReadModeCommand(node, manager)
        }),
        vscode.commands.registerCommand('aws.s3.openFileEditMode', async (uriOrNode: vscode.Uri | S3FileNode) => {
            await openFileEditModeCommand(uriOrNode, manager)
        }),
        vscode.commands.registerCommand('aws.s3.uploadFile', async (node?: S3BucketNode | S3FolderNode) => {
            if (!node) {
                const awsContext = ctx.awsContext
                const regionCode = awsContext.getCredentialDefaultRegion()
                const s3Client = globals.toolkitClientBuilder.createS3Client(regionCode)
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
