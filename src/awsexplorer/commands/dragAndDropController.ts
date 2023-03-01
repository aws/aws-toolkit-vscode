/*!
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { S3FileNode } from '../../s3/explorer/s3FileNode'
import { S3BucketNode } from '../../s3/explorer/s3BucketNode'

interface S3FileDataTransfer {
    bucketname: string
    key: string
    name: string
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
        // Do not set the dataTransfer to any S3 node
        if (source[0] instanceof S3FileNode) {
            const dragData: S3FileDataTransfer = {
                bucketname: source[0].bucket.name,
                key: source[0].file.key,
                name: source[0].file.name,
            }
            dataTransfer.set('application/vnd.code.tree.aws.explorer', new vscode.DataTransferItem(dragData))
        }
    }

    handleDrop(target: any, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): void | Thenable<void> {
        const data = dataTransfer.get('application/vnd.code.tree.aws.explorer')
        if (target instanceof S3BucketNode && data?.value.bucketname && data?.value.key) {
            const s3 = target.s3

            s3.copyObject({
                bucket: target.bucket.name,
                copySource: `${data.value.bucketname}/${data.value.key}`,
                key: data.value.name,
            })

            vscode.commands.executeCommand('aws.refreshAwsExplorer', true)
        }
    }
}
