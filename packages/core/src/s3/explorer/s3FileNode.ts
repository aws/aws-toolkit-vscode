/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import bytes from 'bytes'
import { Bucket, DownloadFileRequest, File, S3Client } from '../../shared/clients/s3Client'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { inspect } from 'util'
import { S3BucketNode } from './s3BucketNode'
import { S3FolderNode } from './s3FolderNode'
import globals from '../../shared/extensionGlobals'
import { formatLocalized, getRelativeDate } from '../../shared/utilities/textUtilities'
import { isCloud9 } from '../../shared/extensionUtilities'
import { getIcon } from '../../shared/icons'

/**
 * Represents an object in an S3 bucket.
 */
export class S3FileNode extends AWSTreeNodeBase implements AWSResourceNode {
    public constructor(
        public readonly bucket: Bucket,
        public readonly file: File,
        public readonly parent: S3BucketNode | S3FolderNode,
        public readonly s3: S3Client,
        now: Date = new globals.clock.Date()
    ) {
        super(file.name)
        if (file.sizeBytes !== undefined && file.lastModified) {
            const readableSize = formatBytes(file.sizeBytes)

            this.tooltip = localize(
                'AWS.explorerNode.s3.fileTooltip',
                '{0}\nSize: {1}\nLast Modified: {2}',
                this.file.key,
                readableSize,
                formatLocalized(file.lastModified)
            )
            this.description = `${readableSize}, ${getRelativeDate(file.lastModified, now)}`
        }
        this.iconPath = getIcon('vscode-file')
        this.contextValue = 'awsS3FileNode'
        this.command = !isCloud9()
            ? {
                  command: 'aws.s3.openFile',
                  title: localize('AWS.command.s3.openFile', 'Open File'),
                  arguments: [this],
              }
            : undefined
    }

    /**
     * See {@link S3Client.downloadFile}.
     */
    public async downloadFile(request: DownloadFileRequest): Promise<void> {
        return this.s3.downloadFile(request)
    }

    /**
     * See {@link S3Client.deleteFile}.
     */
    public async deleteFile(): Promise<void> {
        await this.s3.deleteObject({ bucketName: this.bucket.name, key: this.file.key })
    }

    public get arn(): string {
        return this.file.arn
    }

    public get name(): string {
        return this.file.name
    }

    public get path(): string {
        return this.file.key
    }

    public [inspect.custom](): string {
        return `S3FileNode (bucket=${this.bucket.name}, file=${this.file.key}}`
    }
}

function formatBytes(numBytes: number): string {
    return bytes(numBytes, { unitSeparator: ' ', decimalPlaces: 0 })
}
