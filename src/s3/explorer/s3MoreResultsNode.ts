/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { S3BucketNode } from './s3BucketNode'
import { S3FolderNode } from './s3FolderNode'
import { localize } from '../../shared/utilities/vsCodeUtils'

/**
 * Represents the a "Load More..." node that appears as the last child of Buckets and Folders with more results.
 *
 * Clicking the node executes the Load More command for the parent Node.
 */
export class S3MoreResultsNode extends AWSTreeNodeBase {
    public constructor(public parent: S3BucketNode | S3FolderNode) {
        super(localize('AWS.explorerNode.loadMore', 'Load More...'))
        this.command = {
            command: 'aws.loadMore',
            title: localize('AWS.explorerNode.loadMore', 'Load More...'),
            arguments: [parent],
        }
        this.contextValue = 'awsS3MoreResultsNode'
    }

    public toString(): string {
        return `S3MoreResultsNode (parent=${this.parent})`
    }
}
