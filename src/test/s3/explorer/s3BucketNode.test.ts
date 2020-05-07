/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { S3BucketNode } from '../../../s3/explorer/s3BucketNode'
import { S3FileNode } from '../../../s3/explorer/s3FileNode'
import { S3FolderNode } from '../../../s3/explorer/s3FolderNode'
import { S3MoreResultsNode } from '../../../s3/explorer/s3MoreResultsNode'
import { S3Client, File, Folder, Bucket } from '../../../shared/clients/s3Client'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { deepEqual, instance, mock, when } from '../../utilities/mockito'

describe('S3BucketNode', () => {
    const name = 'bucket-name'
    const continuationToken = 'continuationToken'
    const secondContinuationToken = 'secondContinuationToken'

    const bucket: Bucket = { name, region: 'region', arn: 'arn' }

    const file: File = { name: 'name', key: 'key', arn: 'arn' }
    const moreFile: File = { name: 'moreName', key: 'moreKey', arn: 'moreArn' }

    const folder: Folder = { name: 'folder', path: 'path', arn: 'arn' }
    const moreFolder: Folder = { name: 'moreFolder', path: 'morePath', arn: 'moreArn' }

    let s3: S3Client

    function assertBucketNode(node: AWSTreeNodeBase): void {
        assert.ok(node instanceof S3BucketNode, `Node ${node} should be a Bucket Node`)
        assert.deepStrictEqual((node as S3BucketNode).bucket, bucket)
    }

    function assertFolderNode(node: AWSTreeNodeBase, expectedFolder: Folder): void {
        assert.ok(node instanceof S3FolderNode, `Node ${node} should be a Folder Node`)
        assert.deepStrictEqual((node as S3FolderNode).bucket, bucket)
        assert.deepStrictEqual((node as S3FolderNode).folder, expectedFolder)
    }

    function assertFileNode(node: AWSTreeNodeBase, expectedFile: File): void {
        assert.ok(node instanceof S3FileNode, `Node ${node} should be a File Node`)
        assert.deepStrictEqual((node as S3FileNode).bucket, bucket)
        assert.deepStrictEqual((node as S3FileNode).file, expectedFile)
    }

    function assertMoreResultsNode(node: AWSTreeNodeBase): void {
        assert.ok(node instanceof S3MoreResultsNode, `Node ${node} should be a More Results Node`)
        assertBucketNode((node as S3MoreResultsNode).parent)
    }

    beforeEach(() => {
        s3 = mock()
    })

    describe('first call to getChildren', () => {
        describe('single page of children', () => {
            it('loads and returns initial children', async () => {
                when(s3.listObjects(deepEqual({ bucketName: name, continuationToken: undefined }))).thenResolve({
                    folders: [folder],
                    files: [file],
                    continuationToken: undefined,
                })

                const node = new S3BucketNode(bucket, instance(s3))
                const [folderNode, fileNode, ...otherNodes] = await node.getChildren()

                assertFolderNode(folderNode, folder)
                assertFileNode(fileNode, file)
                assert.strictEqual(otherNodes.length, 0)
            })
        })

        describe('multiple pages of children', () => {
            it('loads and returns initial page of children with node for loading more results', async () => {
                when(s3.listObjects(deepEqual({ bucketName: name, continuationToken: undefined }))).thenResolve({
                    folders: [folder],
                    files: [file],
                    continuationToken,
                })

                const node = new S3BucketNode(bucket, instance(s3))
                const [folderNode, fileNode, moreResultsNode, ...otherNodes] = await node.getChildren()

                assertFolderNode(folderNode, folder)
                assertFileNode(fileNode, file)
                assertMoreResultsNode(moreResultsNode)
                assert.strictEqual(otherNodes.length, 0)
            })
        })
    })

    describe('subsequent calls to getChildren', () => {
        describe('no more pages of children', () => {
            it('returns existing children', async () => {
                when(s3.listObjects(deepEqual({ bucketName: name, continuationToken: undefined }))).thenResolve({
                    folders: [folder],
                    files: [file],
                    continuationToken: undefined,
                })

                const node = new S3BucketNode(bucket, instance(s3))
                await node.getChildren()
                const [folderNode, fileNode, ...otherNodes] = await node.getChildren()

                assertFolderNode(folderNode, folder)
                assertFileNode(fileNode, file)
                assert.strictEqual(otherNodes.length, 0)
            })
        })

        describe('more pages of children', () => {
            it('returns existing children with node for loading more results', async () => {
                when(s3.listObjects(deepEqual({ bucketName: name, continuationToken: undefined }))).thenResolve({
                    folders: [folder],
                    files: [file],
                    continuationToken,
                })

                const node = new S3BucketNode(bucket, instance(s3))
                await node.getChildren()
                const [folderNode, fileNode, moreResultsNode, ...otherNodes] = await node.getChildren()

                assertFolderNode(folderNode, folder)
                assertFileNode(fileNode, file)
                assertMoreResultsNode(moreResultsNode)
                assert.strictEqual(otherNodes.length, 0)
            })
        })
    })

    describe('call to load more children', () => {
        describe('final page of children', () => {
            it('loads and returns new and existing children', async () => {
                when(s3.listObjects(deepEqual({ bucketName: name, continuationToken: undefined }))).thenResolve({
                    folders: [folder],
                    files: [file],
                    continuationToken,
                })

                when(s3.listObjects(deepEqual({ bucketName: name, continuationToken }))).thenResolve({
                    folders: [moreFolder],
                    files: [moreFile],
                    continuationToken: undefined,
                })

                const node = new S3BucketNode(bucket, instance(s3))
                await node.getChildren()

                const [
                    folderNode,
                    fileNode,
                    moreFolderNode,
                    moreFileNode,
                    ...otherNodes
                ] = await node.loadMoreChildren()

                assertFolderNode(folderNode, folder)
                assertFileNode(fileNode, file)
                assertFolderNode(moreFolderNode, moreFolder)
                assertFileNode(moreFileNode, moreFile)
                assert.strictEqual(otherNodes.length, 0)
            })
        })

        describe('not final page of children', () => {
            it('loads and returns new and existing children with node for loading more results', async () => {
                when(s3.listObjects(deepEqual({ bucketName: name, continuationToken: undefined }))).thenResolve({
                    folders: [folder],
                    files: [file],
                    continuationToken,
                })

                when(s3.listObjects(deepEqual({ bucketName: name, continuationToken }))).thenResolve({
                    folders: [moreFolder],
                    files: [moreFile],
                    continuationToken: secondContinuationToken,
                })

                const node = new S3BucketNode(bucket, instance(s3))
                await node.getChildren()

                const [
                    folderNode,
                    fileNode,
                    moreFolderNode,
                    moreFileNode,
                    moreResultsNode,
                    ...otherNodes
                ] = await node.loadMoreChildren()

                assertFolderNode(folderNode, folder)
                assertFileNode(fileNode, file)
                assertFolderNode(moreFolderNode, moreFolder)
                assertFileNode(moreFileNode, moreFile)
                assertMoreResultsNode(moreResultsNode)
                assert.strictEqual(otherNodes.length, 0)
            })
        })
    })
})
