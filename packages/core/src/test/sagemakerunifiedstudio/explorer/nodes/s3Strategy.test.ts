/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { S3Node, createS3ConnectionNode } from '../../../../sagemakerunifiedstudio/explorer/nodes/s3Strategy'
import { S3Client } from '../../../../sagemakerunifiedstudio/shared/client/s3Client'
import { ConnectionClientStore } from '../../../../sagemakerunifiedstudio/shared/client/connectionClientStore'
import { NodeType, ConnectionType } from '../../../../sagemakerunifiedstudio/explorer/nodes/types'
import { ConnectionCredentialsProvider } from '../../../../sagemakerunifiedstudio/auth/providers/connectionCredentialsProvider'

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
                const node = new S3Node({
                    id: 'test-id',
                    nodeType: NodeType.S3_BUCKET,
                    connectionType: ConnectionType.S3,
                    value: { bucket: 'test-bucket' },
                    path: { bucket: 'test-bucket' },
                })

                assert.strictEqual(node.id, 'test-id')
                assert.strictEqual(node.data.nodeType, NodeType.S3_BUCKET)
                assert.strictEqual(node.data.connectionType, ConnectionType.S3)
            })
        })

        describe('getChildren', function () {
            it('should return empty array for leaf nodes', async function () {
                const node = new S3Node({
                    id: 'test-id',
                    nodeType: NodeType.S3_FILE,
                    connectionType: ConnectionType.S3,
                })

                const children = await node.getChildren()
                assert.strictEqual(children.length, 0)
            })

            it('should handle children provider errors', async function () {
                const errorProvider = async () => {
                    throw new Error('Provider error')
                }

                const node = new S3Node(
                    {
                        id: 'test-id',
                        nodeType: NodeType.S3_BUCKET,
                        connectionType: ConnectionType.S3,
                    },
                    errorProvider
                )

                const children = await node.getChildren()
                assert.strictEqual(children.length, 1)
                assert.strictEqual((children[0] as S3Node).data.nodeType, NodeType.ERROR)
            })
        })

        describe('getTreeItem', function () {
            it('should return correct tree item for non-leaf node', async function () {
                const node = new S3Node({
                    id: 'test-id',
                    nodeType: NodeType.S3_BUCKET,
                    connectionType: ConnectionType.S3,
                })

                const treeItem = await node.getTreeItem()
                assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed)
                assert.strictEqual(treeItem.contextValue, NodeType.S3_BUCKET)
            })

            it('should return correct tree item for leaf node', async function () {
                const node = new S3Node({
                    id: 'test-id',
                    nodeType: NodeType.S3_FILE,
                    connectionType: ConnectionType.S3,
                })

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

            const mockClientStore = {
                getS3Client: sandbox.stub().returns(mockS3Client),
            }
            sandbox.stub(ConnectionClientStore, 'getInstance').returns(mockClientStore as any)
        })

        it('should create S3 connection node successfully for non-default connection', function () {
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

            const credentialsProvider = {
                getCredentials: async () => ({
                    accessKeyId: 'test-key',
                    secretAccessKey: 'test-secret',
                }),
            }

            const node = createS3ConnectionNode(
                connection as any,
                credentialsProvider as ConnectionCredentialsProvider,
                'us-east-1'
            )

            assert.strictEqual(node.data.nodeType, NodeType.CONNECTION)
            assert.strictEqual(node.data.connectionType, ConnectionType.S3)
        })

        it('should create S3 connection node for default connection with full path', function () {
            const connection = {
                connectionId: 'conn-123',
                name: 'project.s3_default_folder',
                type: 'S3Connection',
                props: {
                    s3Properties: {
                        s3Uri: 's3://test-bucket/domain/project/',
                    },
                },
            }

            const credentialsProvider = {
                getCredentials: async () => ({
                    accessKeyId: 'test-key',
                    secretAccessKey: 'test-secret',
                }),
            }

            const node = createS3ConnectionNode(
                connection as any,
                credentialsProvider as ConnectionCredentialsProvider,
                'us-east-1'
            )

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

            const credentialsProvider = {
                getCredentials: async () => ({
                    accessKeyId: 'test-key',
                    secretAccessKey: 'test-secret',
                }),
            }

            const node = createS3ConnectionNode(
                connection as any,
                credentialsProvider as ConnectionCredentialsProvider,
                'us-east-1'
            )

            assert.strictEqual(node.data.nodeType, NodeType.ERROR)
        })

        it('should handle bucket listing for non-default connection', async function () {
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

            const credentialsProvider = {
                getCredentials: async () => ({
                    accessKeyId: 'test-key',
                    secretAccessKey: 'test-secret',
                }),
            }

            mockS3Client.listPaths.resolves({
                paths: [
                    {
                        bucket: 'test-bucket',
                        prefix: 'file.txt',
                        displayName: 'file.txt',
                        isFolder: false,
                    },
                ],
                nextToken: undefined,
            })

            const node = createS3ConnectionNode(
                connection as any,
                credentialsProvider as ConnectionCredentialsProvider,
                'us-east-1'
            )
            const children = await node.getChildren()

            assert.strictEqual(children.length, 1)
            assert.strictEqual((children[0] as S3Node).data.nodeType, NodeType.S3_BUCKET)
        })

        it('should handle bucket listing for default connection with full path display', async function () {
            const connection = {
                connectionId: 'conn-123',
                name: 'project.s3_default_folder',
                type: 'S3Connection',
                props: {
                    s3Properties: {
                        s3Uri: 's3://test-bucket/domain/project/',
                    },
                },
            }

            const credentialsProvider = {
                getCredentials: async () => ({
                    accessKeyId: 'test-key',
                    secretAccessKey: 'test-secret',
                }),
            }

            mockS3Client.listPaths.resolves({
                paths: [
                    {
                        bucket: 'test-bucket',
                        prefix: 'domain/project/dev/',
                        displayName: 'dev',
                        isFolder: true,
                    },
                ],
                nextToken: undefined,
            })

            const node = createS3ConnectionNode(
                connection as any,
                credentialsProvider as ConnectionCredentialsProvider,
                'us-east-1'
            )
            const children = await node.getChildren()

            assert.strictEqual(children.length, 1)
            const bucketNode = children[0] as S3Node
            assert.strictEqual(bucketNode.data.nodeType, NodeType.S3_BUCKET)
            // For default connection, should show full path
            assert.strictEqual(bucketNode.data.path?.label, 'test-bucket/domain/project/')
        })
    })
})
