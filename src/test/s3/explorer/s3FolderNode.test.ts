/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { MoreResultsNode } from '../../../awsexplorer/moreResultsNode'
import { S3FileNode } from '../../../s3/explorer/s3FileNode'
import { S3FolderNode } from '../../../s3/explorer/s3FolderNode'
import { S3Client, File, Folder, Bucket } from '../../../shared/clients/s3Client'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { LoadMoreNode } from '../../../shared/treeview/nodes/loadMoreNode'
import { deepEqual, instance, mock, when } from '../../utilities/mockito'
import { FakeWorkspace } from '../../shared/vscode/fakeWorkspace'

describe('S3FolderNode', () => {
    const bucketName = 'bucket-name'
    const path = 'folder/path'
    const continuationToken = 'continuationToken'
    const bucket: Bucket = { name: bucketName, region: 'region', arn: 'arn' }
    const file: File = { name: 'name', key: 'key', arn: 'arn' }
    const folder: Folder = { name: 'folder', path, arn: 'arn' }
    const subFolder: Folder = { name: 'subFolder', path: 'subPath', arn: 'subArn' }
    const maxResults = 200
    const workspace = new FakeWorkspace({
        section: 'aws',
        configuration: { key: 's3.maxItemsPerPage', value: maxResults },
    })

    let s3: S3Client

    function assertFolderNode(node: AWSTreeNodeBase | LoadMoreNode, expectedFolder: Folder): void {
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
        assertFolderNode((node as MoreResultsNode).parent, folder)
    }

    beforeEach(() => {
        s3 = mock()
    })

    describe('getChildren', () => {
        it('gets children', async () => {
            when(
                s3.listFiles(deepEqual({ bucketName, folderPath: path, continuationToken: undefined, maxResults }))
            ).thenResolve({
                folders: [subFolder],
                files: [file],
                continuationToken: undefined,
            })

            const node = new S3FolderNode(bucket, folder, instance(s3), workspace)
            const [subFolderNode, fileNode, ...otherNodes] = await node.getChildren()

            assertFolderNode(subFolderNode, subFolder)
            assertFileNode(fileNode, file)
            assert.strictEqual(otherNodes.length, 0)
        })

        it('gets children with node for loading more results', async () => {
            when(
                s3.listFiles(deepEqual({ bucketName, folderPath: path, continuationToken: undefined, maxResults }))
            ).thenResolve({
                folders: [subFolder],
                files: [file],
                continuationToken,
            })

            const node = new S3FolderNode(bucket, folder, instance(s3), workspace)
            const [subFolderNode, fileNode, moreResultsNode, ...otherNodes] = await node.getChildren()

            assertFolderNode(subFolderNode, subFolder)
            assertFileNode(fileNode, file)
            assertMoreResultsNode(moreResultsNode)
            assert.strictEqual(otherNodes.length, 0)
        })
    })
})
