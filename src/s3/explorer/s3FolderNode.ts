/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

import {
    Bucket,
    CreateFolderRequest,
    CreateFolderResponse,
    Folder,
    S3Client,
    UploadFileRequest,
} from '../../shared/clients/s3Client'
import { ext } from '../../shared/extensionGlobals'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { ErrorNode } from '../../shared/treeview/nodes/errorNode'
import { LoadMoreNode } from '../../shared/treeview/nodes/loadMoreNode'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../shared/treeview/treeNodeUtilities'
import { S3MoreResultsNode } from './s3MoreResultsNode'
import { S3NodeCache } from './s3NodeCache'
import { S3FileNode } from './s3FileNode'
import { localize } from '../../shared/utilities/vsCodeUtils'

/**
 * Represents a folder in an S3 bucket that may contain subfolders and/or objects.
 */
export class S3FolderNode extends AWSTreeNodeBase implements AWSResourceNode, LoadMoreNode {
    private cache: S3NodeCache

    public constructor(public readonly bucket: Bucket, public readonly folder: Folder, private readonly s3: S3Client) {
        super(folder.name, vscode.TreeItemCollapsibleState.Collapsed)
        this.tooltip = folder.path
        this.iconPath = {
            dark: vscode.Uri.file(ext.iconPaths.dark.s3.folder),
            light: vscode.Uri.file(ext.iconPaths.light.s3.folder),
        }
        this.contextValue = 'awsS3FolderNode'
        this.cache = new S3NodeCache(new S3MoreResultsNode(this))
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                if (!this.initialChildrenLoaded()) {
                    return this.loadInitialChildren()
                }

                return this.getExistingChildren()
            },
            getErrorNode: async (error: Error) =>
                new ErrorNode(this, error, localize('AWS.explorerNode.s3.error', 'Error loading S3 resources')),
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.s3.noFiles', '[No Files found]')),
        })
    }

    private initialChildrenLoaded(): boolean {
        return !this.cache.isPristine
    }

    private async loadInitialChildren(): Promise<AWSTreeNodeBase[]> {
        return this.loadMoreChildren()
    }

    private async getExistingChildren(): Promise<AWSTreeNodeBase[]> {
        return this.cache.nodes
    }

    public async loadMoreChildren(): Promise<AWSTreeNodeBase[]> {
        const response = await this.s3.listObjects({
            bucketName: this.bucket.name,
            folderPath: this.folder.path,
            continuationToken: this.cache.continuationToken,
        })

        const newFolders = response.folders.map(folder => new S3FolderNode(this.bucket, folder, this.s3))
        const newFiles = response.files.map(file => new S3FileNode(this.bucket, file, this.s3))

        this.cache.appendItems(newFolders, newFiles, response.continuationToken)
        return this.cache.nodes
    }

    public createFolder(request: CreateFolderRequest): Promise<CreateFolderResponse> {
        return this.s3.createFolder(request)
    }

    public uploadFile(request: UploadFileRequest): Promise<void> {
        return this.s3.uploadFile(request)
    }

    public clearCache(): void {
        this.cache = new S3NodeCache(new S3MoreResultsNode(this))
    }

    public get arn(): string {
        return this.folder.arn
    }

    public get name(): string {
        return this.folder.name
    }

    public get path(): string {
        return this.folder.path
    }

    public toString(): string {
        return `S3FolderNode (bucket=${this.bucket.name}, folder=${this.folder.path})`
    }
}
