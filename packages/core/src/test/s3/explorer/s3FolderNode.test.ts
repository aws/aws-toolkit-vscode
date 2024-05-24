/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { MoreResultsNode } from '../../../awsexplorer/moreResultsNode'
import { S3FileNode } from '../../../s3/explorer/s3FileNode'
import { S3FolderNode } from '../../../s3/explorer/s3FolderNode'
import { S3Client, File, Folder, Bucket } from '../../../shared/clients/s3Client'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { LoadMoreNode } from '../../../shared/treeview/nodes/loadMoreNode'
import { TestSettings } from '../../utilities/testSettingsConfiguration'
import sinon from 'sinon'

describe('S3FolderNode', function () {
    const bucketName = 'bucket-name'
    const path = 'folder/path'
    const continuationToken = 'continuationToken'
    const bucket: Bucket = { name: bucketName, region: 'region', arn: 'arn' }
    const file: File = { name: 'name', key: 'key', arn: 'arn' }
    const folder: Folder = { name: 'folder', path, arn: 'arn' }
    const subFolder: Folder = { name: 'subFolder', path: 'subPath', arn: 'subArn' }
    const maxResults = 200

    let s3: S3Client
    let config: TestSettings

    function assertFolderNode(node: AWSTreeNodeBase | LoadMoreNode, expectedFolder: Folder): void {
        assert.ok(node instanceof S3FolderNode, `Node ${String(node)} should be a Folder Node`)
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

    beforeEach(async () => {
        s3 = {} as any as S3Client
        config = new TestSettings()
        await config.getSection('aws').update('s3.maxItemsPerPage', maxResults)
    })

    describe('getChildren', function () {
        it('gets children', async function () {
            const stub = sinon.stub().resolves({
                folders: [subFolder],
                files: [file],
                continuationToken: undefined,
            })
            s3.listFiles = stub

            const node = new S3FolderNode(bucket, folder, s3, config)
            const [subFolderNode, fileNode, ...otherNodes] = await node.getChildren()

            assert(
                stub.calledOnceWithExactly({ bucketName, folderPath: path, continuationToken: undefined, maxResults })
            )
            assertFolderNode(subFolderNode, subFolder)
            assertFileNode(fileNode, file)
            assert.strictEqual(otherNodes.length, 0)
        })

        it('gets children with node for loading more results', async function () {
            const stub = sinon.stub().resolves({
                folders: [subFolder],
                files: [file],
                continuationToken,
            })
            s3.listFiles = stub

            const node = new S3FolderNode(bucket, folder, s3, config)
            const [subFolderNode, fileNode, moreResultsNode, ...otherNodes] = await node.getChildren()

            assert(
                stub.calledOnceWithExactly({ bucketName, folderPath: path, continuationToken: undefined, maxResults })
            )
            assertFolderNode(subFolderNode, subFolder)
            assertFileNode(fileNode, file)
            assertMoreResultsNode(moreResultsNode)
            assert.strictEqual(otherNodes.length, 0)
        })
    })
})
