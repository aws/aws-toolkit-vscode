/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ChildNodePage } from '../../awsexplorer/childNodeLoader'
import {
    Bucket,
    CreateFolderRequest,
    CreateFolderResponse,
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
import { localize } from '../../shared/utilities/vsCodeUtils'
import { ChildNodeLoader } from '../../awsexplorer/childNodeLoader'
import { Workspace } from '../../shared/vscode/workspace'
import { S3FileNode } from './s3FileNode'
import { S3FolderNode } from './s3FolderNode'
import { inspect } from 'util'
import { getLogger } from '../../shared/logger'
import { S3Node } from './s3Nodes'

/**
 * Represents an S3 bucket that may contain folders and/or objects.
 */
export class S3BucketNode extends AWSTreeNodeBase implements AWSResourceNode, LoadMoreNode {
    private readonly childLoader: ChildNodeLoader

    public constructor(
        public readonly bucket: Bucket,
        public readonly parent: S3Node,
        public readonly s3: S3Client,
        private readonly workspace = Workspace.vscode()
    ) {
        super(bucket.name, vscode.TreeItemCollapsibleState.Collapsed)
        this.tooltip = bucket.name
        this.iconPath = {
            dark: vscode.Uri.file(ext.iconPaths.dark.s3),
            light: vscode.Uri.file(ext.iconPaths.light.s3),
        }
        this.contextValue = 'awsS3BucketNode'
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

    /**
     * See {@link S3Client.deleteBucket}.
     */
    public async deleteBucket(): Promise<void> {
        await this.s3.deleteBucket({ bucketName: this.bucket.name })
    }

    public get arn(): string {
        return this.bucket.arn
    }

    public get name(): string {
        return this.bucket.name
    }

    public get path(): string {
        // Even though the bucket is the "root", there is no '/' prefix on objects inside
        return ''
    }

    public [inspect.custom](): string {
        return `S3BucketNode (bucket=${this.bucket.name})`
    }

    private getMaxItemsPerPage(): number | undefined {
        return this.workspace.getConfiguration('aws').get<number>('s3.maxItemsPerPage')
    }
}
