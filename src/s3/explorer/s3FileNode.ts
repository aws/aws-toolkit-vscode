/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as moment from 'moment'
import * as bytes from 'bytes'
import * as vscode from 'vscode'
import { Bucket, DownloadFileRequest, File, S3Client } from '../../shared/clients/s3Client'
import { ext } from '../../shared/extensionGlobals'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { localize } from '../../shared/utilities/vsCodeUtils'

/**
 * Represents an object in an S3 bucket.
 */
export class S3FileNode extends AWSTreeNodeBase implements AWSResourceNode {
    public constructor(
        public readonly bucket: Bucket,
        public readonly file: File,
        private readonly s3: S3Client,
        now: Date = new Date()
    ) {
        super(file.name)
        if (file.sizeBytes !== undefined && file.lastModified) {
            const readableSize = formatBytes(file.sizeBytes)

            // Prevent clock skew showing future date
            const readableDate = moment(file.lastModified)
                .subtract(5, 'second')
                .from(now)

            this.tooltip = localize(
                'AWS.explorerNode.s3.fileTooltip',
                '{0}\nSize: {1}\nLast Modified: {2}',
                this.file.key,
                readableSize,
                readableDate
            )
            this.description = `${readableSize}, ${readableDate}`
        }
        this.iconPath = {
            dark: vscode.Uri.file(ext.iconPaths.dark.s3.file),
            light: vscode.Uri.file(ext.iconPaths.light.s3.file),
        }
        this.contextValue = 'awsS3FileNode'
    }

    public downloadFile(request: DownloadFileRequest): Promise<void> {
        return this.s3.downloadFile(request)
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

    public toString(): string {
        return `S3FileNode (bucket=${this.bucket.name}, file=${this.file.key}}`
    }
}

function formatBytes(numBytes: number): string {
    return bytes(numBytes, { unitSeparator: ' ', decimalPlaces: 0 })
}
