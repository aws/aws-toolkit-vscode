/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { S3 } from 'aws-sdk'
import sinon from 'sinon'
import { DefaultS3Client } from '../../../../shared/clients/s3Client'
import * as SamUtilsModule from '../../../../shared/sam/utils'
import { createBucketNamePrompter } from '../../../../shared/ui/sam/bucketPrompter'
import { AsyncCollection } from '../../../../shared/utilities/asyncCollection'
import { RequiredProps } from '../../../../shared/utilities/tsUtils'
import { samDeployUrl } from '../../../../shared/constants'

describe('createBucketNamePrompter', () => {
    let sandbox: sinon.SinonSandbox
    const s3Client = new DefaultS3Client('us-east-1', 'aws')
    const mementoRootKey = 'samcli.deploy.params'

    beforeEach(() => {
        sandbox = sinon.createSandbox()
    })

    afterEach(() => {
        sandbox.restore()
    })

    it('should create a prompter with existing buckets', () => {
        // Arrange
        const buckets = [
            { Name: 'bucket1', region: 'us-east-1' },
            { Name: 'bucket2', region: 'us-east-1' },
            { Name: 'bucket3', region: 'us-east-1' },
        ] as unknown as AsyncCollection<RequiredProps<S3.Bucket, 'Name'> & { readonly region: string }>

        const stub = sandbox.stub(s3Client, 'listBucketsIterable').callsFake(() => {
            return buckets
        })
        sandbox.stub(SamUtilsModule, 'getRecentResponse').returns(undefined) // Mock recent bucket

        // Act
        const prompter = createBucketNamePrompter(s3Client, mementoRootKey, samDeployUrl)

        // Assert
        assert.ok(stub.calledOnce)
        const expectedItems = buckets.map((b) => [
            {
                label: b.Name,
                data: b.Name,
                recentlyUsed: false,
            },
        ])
        assert.strictEqual(prompter.quickPick.title, 'Select an S3 Bucket')
        assert.strictEqual(prompter.quickPick.placeholder, 'Select a bucket (or enter a name to create one)')
        assert.strictEqual(prompter.quickPick.items.length, 3)
        assert.deepStrictEqual(prompter.quickPick.items, expectedItems)
    })

    it('should include no items found message if no stacks exist', () => {
        const stub = sandbox.stub(s3Client, 'listBucketsIterable').callsFake(() => {
            return [] as unknown as AsyncCollection<RequiredProps<S3.Bucket, 'Name'> & { readonly region: string }>
        })
        sandbox.stub(SamUtilsModule, 'getRecentResponse').returns(undefined) // Mock recent bucket

        // Act
        const prompter = createBucketNamePrompter(s3Client, mementoRootKey, samDeployUrl)

        // Assert
        assert.ok(stub.calledOnce)
        assert.strictEqual(prompter.quickPick.title, 'Select an S3 Bucket')
        assert.strictEqual(prompter.quickPick.placeholder, 'Select a bucket (or enter a name to create one)')
        assert.strictEqual(prompter.quickPick.items.length, 1)
        assert.strictEqual(
            prompter.quickPick.items[0].label,
            'No S3 buckets for region "us-east-1". Enter a name to create a new one.'
        )
    })
})
