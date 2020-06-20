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
import { isFileIconThemeSeti, localize } from '../../shared/utilities/vsCodeUtils'
import { inspect } from 'util'
import { S3BucketNode } from './s3BucketNode'
import { S3FolderNode } from './s3FolderNode'

/**
 * Moment format for rendering readable dates for S3.
 *
 * Same format used in the S3 console, but it's also locale-aware.
 *
 * US: Jan 5, 2020 5:30:20 PM GMT-0700
 * GB: 5 Jan 2020 17:30:20 GMT+0100
 */
export const S3_DATE_FORMAT = 'll LTS [GMT]ZZ'

/**
 * Represents an object in an S3 bucket.
 */
export class S3FileNode extends AWSTreeNodeBase implements AWSResourceNode {
    public constructor(
        public readonly bucket: Bucket,
        public readonly file: File,
        public readonly parent: S3BucketNode | S3FolderNode,
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
                moment(file.lastModified).format(S3_DATE_FORMAT)
            )
            this.description = `${readableSize}, ${readableDate}`
        }
        this.iconPath = fileIconPath()
        this.contextValue = 'awsS3FileNode'
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

function fileIconPath(): vscode.ThemeIcon | { light: vscode.Uri; dark: vscode.Uri } {
    // Workaround for https://github.com/microsoft/vscode/issues/85654
    // Once this is resolved, ThemeIcons can be used for seti as well
    if (isFileIconThemeSeti()) {
        return {
            dark: vscode.Uri.file(ext.iconPaths.dark.file),
            light: vscode.Uri.file(ext.iconPaths.light.file),
        }
    } else {
        return vscode.ThemeIcon.File
    }
}
