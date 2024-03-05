/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ChildNodePage } from '../../awsexplorer/childNodeLoader'
import { Bucket, CreateFolderRequest, CreateFolderResponse, S3Client } from '../../shared/clients/s3Client'

import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { LoadMoreNode } from '../../shared/treeview/nodes/loadMoreNode'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../shared/treeview/utils'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { ChildNodeLoader } from '../../awsexplorer/childNodeLoader'
import { S3FileNode } from './s3FileNode'
import { S3FolderNode } from './s3FolderNode'
import { inspect } from 'util'
import { getLogger } from '../../shared/logger'
import { S3Node } from './s3Nodes'
import { getIcon } from '../../shared/icons'
import { Settings } from '../../shared/settings'
import { ClassToInterfaceType } from '../../shared/utilities/tsUtils'

/**
 * Represents an S3 bucket that may contain folders and/or objects.
 */
export class S3BucketNode extends AWSTreeNodeBase implements AWSResourceNode, LoadMoreNode {
    private readonly childLoader = new ChildNodeLoader(this, token => this.loadPage(token))

    public constructor(
        public readonly bucket: Bucket,
        public readonly parent: S3Node,
        public readonly s3: S3Client,
        protected readonly settings: ClassToInterfaceType<Settings> = Settings.instance
    ) {
        super(bucket.name, vscode.TreeItemCollapsibleState.Collapsed)
        this.tooltip = bucket.name
        this.iconPath = getIcon('aws-s3-bucket')
        this.contextValue = 'awsS3BucketNode'
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => this.childLoader.getChildren(),
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

    private async loadPage(continuationToken: string | undefined): Promise<ChildNodePage<S3FolderNode | S3FileNode>> {
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
        return this.settings.getSection('aws').get<number>('s3.maxItemsPerPage')
    }
}
