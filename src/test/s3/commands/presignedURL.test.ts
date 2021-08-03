/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { copyUrl, presignedURLCommand } from '../../../s3/commands/presignedURL'
import { S3BucketNode } from '../../../s3/explorer/s3BucketNode'
import { S3FileNode } from '../../../s3/explorer/s3FileNode'
import { S3Node } from '../../../s3/explorer/s3Nodes'
import { Bucket, S3Client } from '../../../shared/clients/s3Client'
import { Window } from '../../../shared/vscode/window'
import { FakeEnv } from '../../shared/vscode/fakeEnv'
import { anything, instance, mock, when } from '../../utilities/mockito'

describe('presignedURLCommand', function () {
    const bucketName = 'bucket-name'
    const key = 'file.jpg'
    const testUrl = 'https://presigned-url.com'

    let env: FakeEnv
    let node: S3FileNode
    let s3: S3Client
    let bucketNode: S3BucketNode
    let window: Window

    beforeEach(function () {
        s3 = mock()
        window = mock()
        env = new FakeEnv()

        const bucket: Bucket = { name: bucketName, region: 'region', arn: 'arn' }
        bucketNode = new S3BucketNode(bucket, {} as S3Node, instance(s3))
        node = new S3FileNode(bucket, { name: key, key: key, arn: 'arn' }, bucketNode, instance(s3))
    })

    it('calls S3 to get the URL', async function () {
        when(window.showInputBox(anything())).thenReturn(Promise.resolve('20'))
        when(s3.getSignedUrl(anything())).thenResolve(testUrl)

        await presignedURLCommand(node, instance(window), env)

        assert.deepStrictEqual(env.clipboard.text, testUrl)
    })

    it('copies a given URL to the clipboard', async function () {
        await copyUrl(testUrl, undefined, env)

        assert.deepStrictEqual(env.clipboard.text, testUrl)
    })
})
