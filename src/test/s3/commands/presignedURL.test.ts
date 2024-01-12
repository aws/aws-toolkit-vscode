/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import {} from '../../../shared/vscode/env'
import { copyToClipboard } from '../../../shared/utilities/messages'
import { presignedURLCommand } from '../../../s3/commands/presignedURL'
import { S3BucketNode } from '../../../s3/explorer/s3BucketNode'
import { S3FileNode } from '../../../s3/explorer/s3FileNode'
import { S3Node } from '../../../s3/explorer/s3Nodes'
import { Bucket, S3Client } from '../../../shared/clients/s3Client'
import { getTestWindow } from '../../shared/vscode/window'
import { FakeClipboard } from '../../shared/vscode/fakeEnv'

describe('presignedURLCommand', function () {
    const bucketName = 'bucket-name'
    const key = 'file.jpg'
    const testUrl = 'https://presigned-url.com'

    let node: S3FileNode
    let s3: S3Client
    let bucketNode: S3BucketNode

    beforeEach(function () {
        const fakeClipboard = new FakeClipboard()
        sinon.stub(vscode.env, 'clipboard').value(fakeClipboard)
        s3 = {} as any as S3Client
        const bucket: Bucket = { name: bucketName, region: 'region', arn: 'arn' }
        bucketNode = new S3BucketNode(bucket, {} as S3Node, s3)
        node = new S3FileNode(bucket, { name: key, key: key, arn: 'arn' }, bucketNode, s3)
    })

    it('calls S3 to get the URL', async function () {
        getTestWindow().onDidShowInputBox(input => input.acceptValue('20'))
        s3.getSignedUrl = sinon.stub().resolves(testUrl)

        await presignedURLCommand(node)

        assert.deepStrictEqual(await vscode.env.clipboard.readText(), testUrl)
    })

    it('copies a given URL to the clipboard', async function () {
        await copyToClipboard(testUrl, 'URL')
        assert.deepStrictEqual(await vscode.env.clipboard.readText(), testUrl)
    })
})
