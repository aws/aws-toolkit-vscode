/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { MoreResultsNode } from '../../../awsexplorer/moreResultsNode'
import { S3BucketNode } from '../../../s3/explorer/s3BucketNode'
import { S3FileNode } from '../../../s3/explorer/s3FileNode'
import { S3FolderNode } from '../../../s3/explorer/s3FolderNode'
import { S3Node } from '../../../s3/explorer/s3Nodes'
import { S3Client, File, Folder, Bucket } from '../../../shared/clients/s3Client'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { LoadMoreNode } from '../../../shared/treeview/nodes/loadMoreNode'
import { TestSettings } from '../../utilities/testSettingsConfiguration'
import sinon from 'sinon'

describe('S3BucketNode', function () {
    const name = 'bucket-name'
    const continuationToken = 'continuationToken'
    const bucket: Bucket = { name, region: 'region', arn: 'arn' }
    const file: File = { name: 'name', key: 'key', arn: 'arn' }
    const folder: Folder = { name: 'folder', path: 'path', arn: 'arn' }
    const maxResults = 200
    let s3: S3Client
    let config: TestSettings

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

    beforeEach(function () {
        s3 = {} as any as S3Client
        config = new TestSettings()
    })

    describe('getChildren', function () {
        it('gets children', async function () {
            const stub = sinon.stub().resolves({
                folders: [folder],
                files: [file],
                continuationToken: undefined,
            })
            s3.listFiles = stub

            await config.getSection('aws').update('s3.maxItemsPerPage', maxResults)
            const node = new S3BucketNode(bucket, new S3Node(s3), s3, config)
            const [folderNode, fileNode, ...otherNodes] = await node.getChildren()

            assert(stub.calledOnceWithExactly({ bucketName: name, continuationToken: undefined, maxResults }))
            assertFolderNode(folderNode, folder)
            assertFileNode(fileNode, file)
            assert.strictEqual(otherNodes.length, 0)
        })

        it('gets children with node for loading more results', async function () {
            const stub = sinon.stub().resolves({
                folders: [folder],
                files: [file],
                continuationToken,
            })
            s3.listFiles = stub

            await config.getSection('aws').update('s3.maxItemsPerPage', maxResults)
            const node = new S3BucketNode(bucket, new S3Node(s3), s3, config)
            const [folderNode, fileNode, moreResultsNode, ...otherNodes] = await node.getChildren()

            assert(stub.calledOnceWithExactly({ bucketName: name, continuationToken: undefined, maxResults }))
            assertFolderNode(folderNode, folder)
            assertFileNode(fileNode, file)
            assertMoreResultsNode(moreResultsNode)
            assert.strictEqual(otherNodes.length, 0)
        })
    })
})
