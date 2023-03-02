/*!
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { S3FileNode } from '../../s3/explorer/s3FileNode'
import { S3BucketNode } from '../../s3/explorer/s3BucketNode'
import { S3FolderNode } from '../../s3/explorer/s3FolderNode'
import { Folder, Bucket } from '../../shared/clients/s3Client'

interface S3FileDataTransfer {
    bucketname: string
    key: string
    name: string
}

interface S3FolderDataTransfer {
    bucket: Bucket
    folder: Folder
}
// When vscode minimum version reaches 1.66, implement vscode.TreeDragAndDropController to this class
export class AwsDragAndDropController {
    public dragMimeTypes: string[] = ['application/vnd.code.tree.aws.explorer']
    public dropMimeTypes: string[] = ['application/vnd.code.tree.aws.explorer']

    handleDrag(
        source: any[],
        dataTransfer: vscode.DataTransfer,
        token: vscode.CancellationToken
    ): void | Thenable<void> {
        const node = source[0]
        // Do not set the dataTransfer to any S3 node
        if (node instanceof S3FileNode) {
            const dragData: S3FileDataTransfer = {
                bucketname: node.bucket.name,
                key: node.file.key,
                name: node.file.name,
            }
            dataTransfer.set('application/vnd.code.tree.aws.explorer', new vscode.DataTransferItem(dragData))
        }

        if (node instanceof S3FolderNode) {
            const dragData: S3FolderDataTransfer = {
                bucket: node.bucket,
                folder: node.folder,
            }
            dataTransfer.set('application/vnd.code.tree.aws.explorer', new vscode.DataTransferItem(dragData))
        }
    }

    handleDrop(target: any, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): void | Thenable<void> {
        const data = dataTransfer.get('application/vnd.code.tree.aws.explorer')
        if (target instanceof S3BucketNode || target instanceof S3FolderNode) {
            const s3 = target.s3

            // if dataTransfer is from an S3FileNode
            if (data?.value.bucketname && data?.value.key) {
                s3.copyObject({
                    bucket: target.bucket.name,
                    copySource: `${data.value.bucketname}/${data.value.key}`,
                    name: data.value.name,
                    folderPath: target instanceof S3FolderNode ? target.folder.path : undefined,
                })
            }
            // if dataTransfer is from an S3FolderNode
            if (data?.value.bucket && data?.value.folder) {
                s3.copyFolder(data.value, {
                    bucketName: target.bucket.name,
                    folderPath: target instanceof S3FolderNode ? target.folder.path : undefined,
                })
            }
            vscode.commands.executeCommand('aws.refreshAwsExplorer', true)
        }
    }
}
