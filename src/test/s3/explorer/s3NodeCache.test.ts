/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { S3BucketNode } from '../../../s3/explorer/s3BucketNode'
import { S3FileNode } from '../../../s3/explorer/s3FileNode'
import { S3FolderNode } from '../../../s3/explorer/s3FolderNode'
import { S3MoreResultsNode } from '../../../s3/explorer/s3MoreResultsNode'
import { S3NodeCache } from '../../../s3/explorer/s3NodeCache'
import { S3Client, File, Folder, Bucket } from '../../../shared/clients/s3Client'

describe('S3NodeCache', () => {
    const continuationToken = 'continuationToken'

    const bucket: Bucket = { name: 'bucket-name', region: 'region', arn: 'arn' }
    const file: File = { name: 'file', key: 'key', arn: 'arn' }
    const newFile: File = { name: 'newFile', key: 'newKey', arn: 'newArn' }
    const folder: Folder = { name: 'folder', path: 'path', arn: 'arn' }
    const newFolder: Folder = { name: 'newFolder', path: 'newPath', arn: 'newArn' }

    const bucketNode = createBucketNode()
    const fileNode = createFileNode(file)
    const newFileNode = createFileNode(newFile)
    const folderNode = createFolderNode(folder)
    const newFolderNode = createFolderNode(newFolder)
    const moreResultsNode = new S3MoreResultsNode(bucketNode)

    function createBucketNode(): S3BucketNode {
        return new S3BucketNode(bucket, {} as S3Client)
    }

    function createFolderNode(forFolder: Folder): S3FolderNode {
        return new S3FolderNode(bucket, forFolder, {} as S3Client)
    }

    function createFileNode(forFile: File): S3FileNode {
        return new S3FileNode(bucket, forFile, {} as S3Client)
    }

    it('starts empty, with no continuation token, and is pristine', () => {
        const cache = new S3NodeCache(moreResultsNode)

        assert.deepStrictEqual(cache.nodes, [])
        assert.strictEqual(cache.continuationToken, undefined)
        assert.strictEqual(cache.isPristine, true)
    })

    it('appends initial items and updates pristine state', () => {
        const cache = new S3NodeCache(moreResultsNode)
        cache.appendItems([folderNode], [fileNode], continuationToken)

        assert.deepStrictEqual(cache.nodes, [folderNode, fileNode, moreResultsNode])
        assert.strictEqual(cache.continuationToken, continuationToken)
        assert.strictEqual(cache.isPristine, false)
    })

    it('appends additional items', () => {
        const cache = new S3NodeCache(moreResultsNode)
        cache.appendItems([folderNode], [fileNode], continuationToken)
        cache.appendItems([newFolderNode], [newFileNode], undefined)
        assert.deepStrictEqual(cache.nodes, [folderNode, fileNode, newFolderNode, newFileNode])
        assert.strictEqual(cache.continuationToken, undefined)
        assert.strictEqual(cache.isPristine, false)
    })
})
