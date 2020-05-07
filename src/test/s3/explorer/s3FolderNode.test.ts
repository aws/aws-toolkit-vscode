/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { S3FileNode } from '../../../s3/explorer/s3FileNode'
import { S3FolderNode } from '../../../s3/explorer/s3FolderNode'
import { S3MoreResultsNode } from '../../../s3/explorer/s3MoreResultsNode'
import { S3Client, File, Folder, Bucket } from '../../../shared/clients/s3Client'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { deepEqual, instance, mock, when } from '../../utilities/mockito'

describe('S3FolderNode', () => {
    const bucketName = 'bucket-name'
    const path = 'folder/path'
    const continuationToken = 'continuationToken'
    const secondContinuationToken = 'secondContinuationToken'

    const bucket: Bucket = { name: bucketName, region: 'region', arn: 'arn' }

    const file: File = { name: 'name', key: 'key', arn: 'arn' }
    const moreFile: File = { name: 'moreName', key: 'moreKey', arn: 'moreArn' }

    const folder: Folder = { name: 'folder', path, arn: 'arn' }
    const subFolder: Folder = { name: 'subFolder', path: 'subPath', arn: 'subArn' }
    const moreSubFolder: Folder = { name: 'moreSubFolder', path: 'moreSubPath', arn: 'moreSubArn' }

    let s3: S3Client

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
        assertFolderNode((node as S3MoreResultsNode).parent, folder)
    }

    beforeEach(() => {
        s3 = mock()
    })

    describe('first call to getChildren', () => {
        describe('single page of children', () => {
            it('loads and returns initial children', async () => {
                when(
                    s3.listObjects(deepEqual({ bucketName, folderPath: path, continuationToken: undefined }))
                ).thenResolve({
                    folders: [subFolder],
                    files: [file],
                    continuationToken: undefined,
                })

                const node = new S3FolderNode(bucket, folder, instance(s3))
                const [subFolderNode, fileNode, ...otherNodes] = await node.getChildren()

                assertFolderNode(subFolderNode, subFolder)
                assertFileNode(fileNode, file)
                assert.strictEqual(otherNodes.length, 0)
            })
        })

        describe('multiple pages of children', () => {
            it('loads and returns initial page of children with node for loading more results', async () => {
                when(
                    s3.listObjects(deepEqual({ bucketName, folderPath: path, continuationToken: undefined }))
                ).thenResolve({
                    folders: [subFolder],
                    files: [file],
                    continuationToken,
                })

                const node = new S3FolderNode(bucket, folder, instance(s3))
                const [subFolderNode, fileNode, moreResultsNode, ...otherNodes] = await node.getChildren()

                assertFolderNode(subFolderNode, subFolder)
                assertFileNode(fileNode, file)
                assertMoreResultsNode(moreResultsNode)
                assert.strictEqual(otherNodes.length, 0)
            })
        })
    })

    describe('subsequent calls to getChildren', () => {
        describe('no more pages of children', () => {
            it('returns existing children', async () => {
                when(
                    s3.listObjects(
                        deepEqual({
                            bucketName,
                            folderPath: path,
                            continuationToken: undefined,
                        })
                    )
                ).thenResolve({
                    folders: [subFolder],
                    files: [file],
                    continuationToken: undefined,
                })

                const node = new S3FolderNode(bucket, folder, instance(s3))
                await node.getChildren()
                const [subFolderNode, fileNode, ...otherNodes] = await node.getChildren()

                assertFolderNode(subFolderNode, subFolder)
                assertFileNode(fileNode, file)
                assert.strictEqual(otherNodes.length, 0)
            })
        })

        describe('more pages of children', () => {
            it('returns existing children with node for loading more results', async () => {
                when(
                    s3.listObjects(
                        deepEqual({
                            bucketName,
                            folderPath: path,
                            continuationToken: undefined,
                        })
                    )
                ).thenResolve({
                    folders: [subFolder],
                    files: [file],
                    continuationToken,
                })

                const node = new S3FolderNode(bucket, folder, instance(s3))
                await node.getChildren()
                const [subFolderNode, fileNode, moreResultsNode, ...otherNodes] = await node.getChildren()

                assertFolderNode(subFolderNode, subFolder)
                assertFileNode(fileNode, file)
                assertMoreResultsNode(moreResultsNode)
                assert.strictEqual(otherNodes.length, 0)
            })
        })
    })

    describe('call to load more children', () => {
        describe('final page of children', () => {
            it('loads and returns new and existing children', async () => {
                when(
                    s3.listObjects(
                        deepEqual({
                            bucketName,
                            folderPath: path,
                            continuationToken: undefined,
                        })
                    )
                ).thenResolve({
                    folders: [subFolder],
                    files: [file],
                    continuationToken,
                })

                when(s3.listObjects(deepEqual({ bucketName, folderPath: path, continuationToken }))).thenResolve({
                    folders: [moreSubFolder],
                    files: [moreFile],
                    continuationToken: undefined,
                })

                const node = new S3FolderNode(bucket, folder, instance(s3))
                await node.getChildren()

                const [
                    subFolderNode,
                    fileNode,
                    moreSubFolderNode,
                    moreFileNode,
                    ...otherNodes
                ] = await node.loadMoreChildren()

                assertFolderNode(subFolderNode, subFolder)
                assertFileNode(fileNode, file)
                assertFolderNode(moreSubFolderNode, moreSubFolder)
                assertFileNode(moreFileNode, moreFile)
                assert.strictEqual(otherNodes.length, 0)
            })
        })

        describe('not final page of children', () => {
            it('loads and returns new and existing children with node for loading more results', async () => {
                when(
                    s3.listObjects(deepEqual({ bucketName, folderPath: path, continuationToken: undefined }))
                ).thenResolve({
                    folders: [subFolder],
                    files: [file],
                    continuationToken,
                })

                when(s3.listObjects(deepEqual({ bucketName, folderPath: path, continuationToken }))).thenResolve({
                    folders: [moreSubFolder],
                    files: [moreFile],
                    continuationToken: secondContinuationToken,
                })

                const node = new S3FolderNode(bucket, folder, instance(s3))
                await node.getChildren()

                const [
                    subFolderNode,
                    fileNode,
                    moreSubFolderNode,
                    moreFileNode,
                    moreResultsNode,
                    ...otherNodes
                ] = await node.loadMoreChildren()

                assertFolderNode(subFolderNode, subFolder)
                assertFileNode(fileNode, file)
                assertFolderNode(moreSubFolderNode, moreSubFolder)
                assertFileNode(moreFileNode, moreFile)
                assertMoreResultsNode(moreResultsNode)
                assert.strictEqual(otherNodes.length, 0)
            })
        })
    })
})
