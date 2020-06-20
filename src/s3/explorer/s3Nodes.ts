/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { CreateBucketRequest, CreateBucketResponse, S3Client } from '../../shared/clients/s3Client'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { ErrorNode } from '../../shared/treeview/nodes/errorNode'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../shared/treeview/treeNodeUtilities'
import { S3BucketNode } from './s3BucketNode'
import { inspect } from 'util'

/**
 * An AWS Explorer node representing S3.
 *
 * Contains buckets for a specific region as child nodes.
 */
export class S3Node extends AWSTreeNodeBase {
    public constructor(private readonly s3: S3Client) {
        super('S3', vscode.TreeItemCollapsibleState.Collapsed)
        this.contextValue = 'awsS3Node'
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                const response = await this.s3.listBuckets()

                return response.buckets.map(bucket => new S3BucketNode(bucket, this, this.s3))
            },
            getErrorNode: async (error: Error) =>
                new ErrorNode(this, error, localize('AWS.explorerNode.s3.error', 'Error loading S3 resources')),
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.s3.noBuckets', '[No Buckets found]')),
        })
    }

    /**
     * See {@link S3Client.createBucket}.
     */
    public async createBucket(request: CreateBucketRequest): Promise<CreateBucketResponse> {
        return this.s3.createBucket(request)
    }

    public [inspect.custom](): string {
        return 'S3Node'
    }
}
