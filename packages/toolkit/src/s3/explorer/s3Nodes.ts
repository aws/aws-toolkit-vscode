/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { CreateBucketRequest, CreateBucketResponse, S3Client } from '../../shared/clients/s3Client'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../shared/treeview/utils'
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

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                const response = await this.s3.listBuckets()

                return response.buckets.map(bucket => new S3BucketNode(bucket, this, this.s3))
            },
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
