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
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { ErrorNode } from '../../shared/treeview/nodes/errorNode'
import { LoadMoreNode } from '../../shared/treeview/nodes/loadMoreNode'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../shared/treeview/treeNodeUtilities'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { ChildNodeLoader } from '../../awsexplorer/childNodeLoader'
import { ChildNodePage } from '../../awsexplorer/childNodeLoader'
import { folderIconPath } from '../../shared/utilities/vsCodeUtils'
import { S3FileNode } from './s3FileNode'
import { inspect } from 'util'
import { Workspace } from '../../shared/vscode/workspace'
import { getLogger } from '../../shared/logger'

/**
 * Represents a folder in an S3 bucket that may contain subfolders and/or objects.
 */
export class S3FolderNode extends AWSTreeNodeBase implements AWSResourceNode, LoadMoreNode {
    private readonly childLoader: ChildNodeLoader

    public constructor(
        public readonly bucket: Bucket,
        public readonly folder: Folder,
        public readonly s3: S3Client,
        private readonly workspace = Workspace.vscode()
    ) {
        super(folder.name, vscode.TreeItemCollapsibleState.Collapsed)
        this.tooltip = folder.path
        this.iconPath = folderIconPath()
        this.contextValue = 'awsS3FolderNode'
        this.childLoader = new ChildNodeLoader(this, token => this.loadPage(token))
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => this.childLoader.getChildren(),
            getErrorNode: async (error: Error, logID: number) => new ErrorNode(this, error, logID),
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.s3.noObjects', '[No Objects found]')),
        })
    }

    public async loadMoreChildren(): Promise<void> {
        await this.childLoader.loadMoreChildren()
    }

    public isLoadingMoreChildren(): boolean {
        return this.childLoader.isLoadingMoreChildren()
    }

    public clearChildren(): void {
        this.childLoader.clearChildren()
    }

    private async loadPage(continuationToken: string | undefined): Promise<ChildNodePage> {
        getLogger().debug(`Loading page for %O using continuationToken %s`, this, continuationToken)
        const response = await this.s3.listFiles({
            bucketName: this.bucket.name,
            folderPath: this.folder.path,
            continuationToken,
            maxResults: this.getMaxItemsPerPage(),
        })

        const newFolders = response.folders.map(folder => new S3FolderNode(this.bucket, folder, this.s3))
        const newFiles = response.files.map(file => new S3FileNode(this.bucket, file, this, this.s3))

        getLogger().debug(`Loaded folders: %O and files: %O`, newFolders, newFiles)
        return {
            newContinuationToken: response.continuationToken,
            newChildren: [...newFolders, ...newFiles],
        }
    }

    /**
     * See {@link S3Client.createFolder}.
     */
    public async createFolder(request: CreateFolderRequest): Promise<CreateFolderResponse> {
        return this.s3.createFolder(request)
    }

    /**
     * See {@link S3Client.uploadFile}.
     */
    public async uploadFile(request: UploadFileRequest): Promise<void> {
        return this.s3.uploadFile(request)
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

    public [inspect.custom](): string {
        return `S3FolderNode (bucket=${this.bucket.name}, folder=${this.folder.path})`
    }

    private getMaxItemsPerPage(): number | undefined {
        return this.workspace.getConfiguration('aws').get<number>('s3.maxItemsPerPage')
    }
}
