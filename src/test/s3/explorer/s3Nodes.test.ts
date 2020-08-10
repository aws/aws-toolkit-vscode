/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { S3BucketNode } from '../../../s3/explorer/s3BucketNode'
import { S3Node } from '../../../s3/explorer/s3Nodes'
import { S3Client, Bucket } from '../../../shared/clients/s3Client'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { instance, mock, when } from '../../utilities/mockito'

describe('S3Node', () => {
    const firstBucket: Bucket = { name: 'first-bucket-name', region: 'firstRegion', arn: 'firstArn' }
    const secondBucket: Bucket = { name: 'second-bucket-name', region: 'secondRegion', arn: 'secondArn' }

    let s3: S3Client

    function assertBucketNode(node: AWSTreeNodeBase, expectedBucket: Bucket): void {
        assert.ok(node instanceof S3BucketNode, `Node ${node} should be a Bucket Node`)
        assert.deepStrictEqual((node as S3BucketNode).bucket, expectedBucket)
    }

    beforeEach(() => {
        s3 = mock()
    })

    it('gets children', async () => {
        when(s3.listBuckets()).thenResolve({
            buckets: [firstBucket, secondBucket],
        })

        const node = new S3Node(instance(s3))
        const [firstBucketNode, secondBucketNode, ...otherNodes] = await node.getChildren()

        assertBucketNode(firstBucketNode, firstBucket)
        assertBucketNode(secondBucketNode, secondBucket)
        assert.strictEqual(otherNodes.length, 0)
    })
})
