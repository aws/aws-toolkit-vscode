/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { MoreResultsNode } from '../../../awsexplorer/moreResultsNode'
import { S3BucketNode } from '../../../s3/explorer/s3BucketNode'
import { S3FileNode } from '../../../s3/explorer/s3FileNode'
import { S3FolderNode } from '../../../s3/explorer/s3FolderNode'
import { S3Node } from '../../../s3/explorer/s3Nodes'
import { S3Client, File, Folder, Bucket } from '../../../shared/clients/s3Client'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { LoadMoreNode } from '../../../shared/treeview/nodes/loadMoreNode'
import { deepEqual, instance, mock, when } from '../../utilities/mockito'
import { FakeWorkspace } from '../../shared/vscode/fakeWorkspace'

describe('S3BucketNode', () => {
    const name = 'bucket-name'
    const continuationToken = 'continuationToken'
    const bucket: Bucket = { name, region: 'region', arn: 'arn' }
    const file: File = { name: 'name', key: 'key', arn: 'arn' }
    const folder: Folder = { name: 'folder', path: 'path', arn: 'arn' }
    const maxResults = 200
    let s3: S3Client

    function assertBucketNode(node: LoadMoreNode): void {
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
        assert.ok(node instanceof MoreResultsNode, `Node ${node} should be a More Results Node`)
        assertBucketNode((node as MoreResultsNode).parent)
    }

    beforeEach(() => {
        s3 = mock()
    })

    describe('getChildren', () => {
        it('gets children', async () => {
            when(s3.listFiles(deepEqual({ bucketName: name, continuationToken: undefined, maxResults }))).thenResolve({
                folders: [folder],
                files: [file],
                continuationToken: undefined,
            })

            const workspace = new FakeWorkspace({
                section: 'aws',
                configuration: { key: 's3.maxItemsPerPage', value: maxResults },
            })
            const node = new S3BucketNode(bucket, new S3Node(instance(s3)), instance(s3), workspace)
            const [folderNode, fileNode, ...otherNodes] = await node.getChildren()

            assertFolderNode(folderNode, folder)
            assertFileNode(fileNode, file)
            assert.strictEqual(otherNodes.length, 0)
        })

        it('gets children with node for loading more results', async () => {
            when(s3.listFiles(deepEqual({ bucketName: name, continuationToken: undefined, maxResults }))).thenResolve({
                folders: [folder],
                files: [file],
                continuationToken,
            })

            const workspace = new FakeWorkspace({
                section: 'aws',
                configuration: { key: 's3.maxItemsPerPage', value: maxResults },
            })
            const node = new S3BucketNode(bucket, new S3Node(instance(s3)), instance(s3), workspace)
            const [folderNode, fileNode, moreResultsNode, ...otherNodes] = await node.getChildren()

            assertFolderNode(folderNode, folder)
            assertFileNode(fileNode, file)
            assertMoreResultsNode(moreResultsNode)
            assert.strictEqual(otherNodes.length, 0)
        })
    })
})
