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
import { AWSCommandTreeNode } from '../../shared/treeview/nodes/awsCommandTreeNode'

/**
 * An AWS Explorer node representing S3.
 *
 * Contains buckets for a specific region as child nodes.
 */
export class S3Node extends AWSTreeNodeBase {
    private readonly addedBuckets: S3BucketNode[] = []

    public constructor(private readonly s3: S3Client, private readonly regionCode: string) {
        super('S3', vscode.TreeItemCollapsibleState.Collapsed)
        this.contextValue = 'awsS3Node'
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                return this.listBucketNodes()
            },
            getErrorNode: async (error: Error, logID: number) =>
                new ErrorNode(this, error, logID),
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.s3.noBuckets', '[No Buckets found]')),
        })
    }

    private async listBucketNodes(): Promise<(S3BucketNode | AWSCommandTreeNode)[]> {
        try {
            const response = await this.s3.listBuckets()
            return response.buckets.map(bucket => new S3BucketNode(bucket, this, this.s3))
        } catch (err) {
            if (err.code === 'AccessDenied') {
                if (this.addedBuckets.length === 0) {
                    const localizedText = localize('AWS.explorerNode.s3.addBucket', 'Click to add existing bucket')
                    return [new AWSCommandTreeNode(this, localizedText, 'aws.s3.addBucket', [this])]
                } 

                return this.addedBuckets
            } else {
                throw err
            }
        }
    }

    public async addBucket(bucketName: string): Promise<void> {
        await this.s3.listFiles({ bucketName })
        // For now, there isn't a good way to get a bucket's region + ARN from its name.
        const bucket = { name: bucketName, region: this.regionCode, arn: `arn:aws:s3:::${bucketName}` }
        this.addedBuckets.push(new S3BucketNode(bucket, this, this.s3))
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
