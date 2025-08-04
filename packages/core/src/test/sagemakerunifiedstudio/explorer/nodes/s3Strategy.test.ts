/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { S3Node, createS3ConnectionNode } from '../../../../sagemakerunifiedstudio/explorer/nodes/s3Strategy'
import { S3Client } from '../../../../sagemakerunifiedstudio/shared/client/s3Client'
import { NodeType, ConnectionType } from '../../../../sagemakerunifiedstudio/explorer/nodes/types'

describe('s3Strategy', function () {
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('S3Node', function () {
        describe('constructor', function () {
            it('should create node with correct properties', function () {
                const node = new S3Node(
                    'test-id',
                    NodeType.S3_BUCKET,
                    'Test Bucket',
                    ConnectionType.S3,
                    { bucket: 'test-bucket' },
                    { bucket: 'test-bucket' }
                )

                assert.strictEqual(node.id, 'test-id')
                assert.strictEqual(node.data.nodeType, NodeType.S3_BUCKET)
                assert.strictEqual(node.data.connectionType, ConnectionType.S3)
            })
        })

        describe('fromNodeData', function () {
            it('should create node from data', function () {
                const node = S3Node.fromNodeData(
                    'test-id',
                    NodeType.S3_FILE,
                    'test.txt',
                    ConnectionType.S3,
                    { size: 1024 },
                    { bucket: 'test-bucket', key: 'test.txt' }
                )

                assert.strictEqual(node.id, 'test-id')
                assert.strictEqual(node.data.nodeType, NodeType.S3_FILE)
            })
        })

        describe('createErrorNode', function () {
            it('should create error node', function () {
                const error = new Error('Test error')
                const node = S3Node.createErrorNode('error-id', error)

                assert.strictEqual(node.id, 'error-id')
                assert.strictEqual(node.data.nodeType, NodeType.ERROR)
            })
        })

        describe('createLoadingNode', function () {
            it('should create loading node', function () {
                const node = S3Node.createLoadingNode('loading-id')

                assert.strictEqual(node.id, 'loading-id')
                assert.strictEqual(node.data.nodeType, NodeType.LOADING)
            })
        })

        describe('createEmptyNode', function () {
            it('should create empty node', function () {
                const node = S3Node.createEmptyNode('empty-id', 'No items')

                assert.strictEqual(node.id, 'empty-id')
                assert.strictEqual(node.data.nodeType, NodeType.EMPTY)
            })
        })

        describe('getChildren', function () {
            it('should return cached children if available', async function () {
                const node = S3Node.fromNodeData(
                    'test-id',
                    NodeType.S3_BUCKET,
                    'Test Bucket',
                    ConnectionType.S3,
                    {},
                    {},
                    [S3Node.createEmptyNode('child', 'Child')]
                )

                const children = await node.getChildren()
                assert.strictEqual(children.length, 1)
            })

            it('should return empty array for leaf nodes', async function () {
                const node = S3Node.fromNodeData('test-id', NodeType.S3_FILE, 'test.txt', ConnectionType.S3)

                const children = await node.getChildren()
                assert.strictEqual(children.length, 0)
            })

            it('should handle children provider errors', async function () {
                const errorProvider = async () => {
                    throw new Error('Provider error')
                }

                const node = S3Node.fromNodeData(
                    'test-id',
                    NodeType.S3_BUCKET,
                    'Test Bucket',
                    ConnectionType.S3,
                    {},
                    {},
                    undefined,
                    undefined,
                    false,
                    errorProvider
                )

                const children = await node.getChildren()
                assert.strictEqual(children.length, 1)
                assert.strictEqual((children[0] as S3Node).data.nodeType, NodeType.ERROR)
            })
        })

        describe('getTreeItem', function () {
            it('should return correct tree item for non-leaf node', async function () {
                const node = S3Node.fromNodeData('test-id', NodeType.S3_BUCKET, 'Test Bucket', ConnectionType.S3)

                const treeItem = await node.getTreeItem()
                assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed)
                assert.strictEqual(treeItem.contextValue, NodeType.S3_BUCKET)
            })

            it('should return correct tree item for leaf node', async function () {
                const node = S3Node.fromNodeData('test-id', NodeType.S3_FILE, 'test.txt', ConnectionType.S3)

                const treeItem = await node.getTreeItem()
                assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.None)
            })
        })
    })

    describe('createS3ConnectionNode', function () {
        let mockS3Client: sinon.SinonStubbedInstance<S3Client>

        beforeEach(function () {
            mockS3Client = {
                listPaths: sandbox.stub(),
            } as any

            sandbox.stub(S3Client.prototype, 'constructor' as any)
            sandbox.stub(S3Client.prototype, 'listPaths').callsFake(mockS3Client.listPaths)
        })

        it('should create S3 connection node successfully', function () {
            const connection = {
                connectionId: 'conn-123',
                name: 'Test S3 Connection',
                type: 'S3Connection',
                props: {
                    s3Properties: {
                        s3Uri: 's3://test-bucket/prefix/',
                    },
                },
            }

            const credentials = {
                accessKeyId: 'test-key',
                secretAccessKey: 'test-secret',
            }

            const node = createS3ConnectionNode(connection as any, credentials, 'us-east-1')

            assert.strictEqual(node.data.nodeType, NodeType.CONNECTION)
            assert.strictEqual(node.data.connectionType, ConnectionType.S3)
        })

        it('should return error node when no S3 URI found', function () {
            const connection = {
                connectionId: 'conn-123',
                name: 'Test S3 Connection',
                type: 'S3Connection',
                props: {},
            }

            const credentials = {
                accessKeyId: 'test-key',
                secretAccessKey: 'test-secret',
            }

            const node = createS3ConnectionNode(connection as any, credentials, 'us-east-1')

            assert.strictEqual(node.data.nodeType, NodeType.ERROR)
        })

        it('should handle bucket listing with children provider', async function () {
            const connection = {
                connectionId: 'conn-123',
                name: 'Test S3 Connection',
                type: 'S3Connection',
                props: {
                    s3Properties: {
                        s3Uri: 's3://test-bucket/',
                    },
                },
            }

            const credentials = {
                accessKeyId: 'test-key',
                secretAccessKey: 'test-secret',
            }

            mockS3Client.listPaths.resolves([
                {
                    bucket: 'test-bucket',
                    prefix: 'file.txt',
                    displayName: 'file.txt',
                    isFolder: false,
                },
            ])

            const node = createS3ConnectionNode(connection as any, credentials, 'us-east-1')
            const children = await node.getChildren()

            assert.strictEqual(children.length, 1)
            assert.strictEqual((children[0] as S3Node).data.nodeType, NodeType.S3_BUCKET)
        })
    })
})
