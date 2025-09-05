/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import {
    RedshiftNode,
    createRedshiftConnectionNode,
} from '../../../../sagemakerunifiedstudio/explorer/nodes/redshiftStrategy'
import { SQLWorkbenchClient } from '../../../../sagemakerunifiedstudio/shared/client/sqlWorkbenchClient'
import * as sqlWorkbenchClient from '../../../../sagemakerunifiedstudio/shared/client/sqlWorkbenchClient'
import { ConnectionClientStore } from '../../../../sagemakerunifiedstudio/shared/client/connectionClientStore'
import { NodeType } from '../../../../sagemakerunifiedstudio/explorer/nodes/types'
import { ConnectionCredentialsProvider } from '../../../../sagemakerunifiedstudio/auth/providers/connectionCredentialsProvider'

describe('redshiftStrategy', function () {
    let sandbox: sinon.SinonSandbox

    beforeEach(function () {
        sandbox = sinon.createSandbox()
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('RedshiftNode', function () {
        describe('constructor', function () {
            it('should create node with correct properties', function () {
                const nodeData = {
                    id: 'test-id',
                    nodeType: NodeType.REDSHIFT_CLUSTER,
                    value: { clusterName: 'test-cluster' },
                }

                const node = new RedshiftNode(nodeData)

                assert.strictEqual(node.id, 'test-id')
                assert.strictEqual(node.data.nodeType, NodeType.REDSHIFT_CLUSTER)
                assert.deepStrictEqual(node.resource, { clusterName: 'test-cluster' })
            })
        })

        describe('getChildren', function () {
            it('should return cached children if available', async function () {
                const nodeData = {
                    id: 'test-id',
                    nodeType: NodeType.REDSHIFT_CLUSTER,
                }

                const node = new RedshiftNode(nodeData)
                // Simulate cached children
                ;(node as any).childrenNodes = [{ id: 'cached-child' }]

                const children = await node.getChildren()
                assert.strictEqual(children.length, 1)
                assert.strictEqual((children[0] as any).id, 'cached-child')
            })

            it('should return empty array for leaf nodes', async function () {
                const nodeData = {
                    id: 'test-id',
                    nodeType: NodeType.REDSHIFT_COLUMN,
                }

                const node = new RedshiftNode(nodeData)
                const children = await node.getChildren()
                assert.strictEqual(children.length, 0)
            })
        })

        describe('getTreeItem', function () {
            it('should return correct tree item for regular nodes', async function () {
                const nodeData = {
                    id: 'test-cluster',
                    nodeType: NodeType.REDSHIFT_CLUSTER,
                    value: { clusterName: 'test-cluster' },
                }

                const node = new RedshiftNode(nodeData)
                const treeItem = await node.getTreeItem()

                assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.Collapsed)
                assert.strictEqual(treeItem.contextValue, NodeType.REDSHIFT_CLUSTER)
            })

            it('should return column tree item for column nodes', async function () {
                const nodeData = {
                    id: 'test-column',
                    nodeType: NodeType.REDSHIFT_COLUMN,
                    value: { type: 'VARCHAR(255)' },
                }

                const node = new RedshiftNode(nodeData)
                const treeItem = await node.getTreeItem()

                assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.None)
                assert.strictEqual(treeItem.description, 'VARCHAR(255)')
            })

            it('should return leaf tree item for leaf nodes', async function () {
                const nodeData = {
                    id: 'test-column',
                    nodeType: NodeType.REDSHIFT_COLUMN,
                }

                const node = new RedshiftNode(nodeData)
                const treeItem = await node.getTreeItem()

                assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.None)
            })
        })

        describe('getParent', function () {
            it('should return parent node', function () {
                const parentData = { id: 'parent', nodeType: NodeType.REDSHIFT_CLUSTER }
                const parent = new RedshiftNode(parentData)

                const nodeData = {
                    id: 'child',
                    nodeType: NodeType.REDSHIFT_DATABASE,
                    parent: parent,
                }

                const node = new RedshiftNode(nodeData)
                assert.strictEqual(node.getParent(), parent)
            })
        })
    })

    describe('createRedshiftConnectionNode', function () {
        let mockSQLClient: sinon.SinonStubbedInstance<SQLWorkbenchClient>

        beforeEach(function () {
            mockSQLClient = {
                executeQuery: sandbox.stub(),
                getResources: sandbox.stub(),
            } as any

            sandbox.stub(SQLWorkbenchClient, 'createWithCredentials').returns(mockSQLClient as any)
            sandbox.stub(sqlWorkbenchClient, 'createRedshiftConnectionConfig').resolves({
                id: 'test-connection-id',
                type: '4',
                databaseType: 'REDSHIFT',
                connectableResourceIdentifier: 'test-cluster',
                connectableResourceType: 'CLUSTER',
                database: 'test-db',
            })

            const mockClientStore = {
                getSQLWorkbenchClient: sandbox.stub().returns(mockSQLClient),
            }
            sandbox.stub(ConnectionClientStore, 'getInstance').returns(mockClientStore as any)
        })

        it.skip('should create Redshift connection node with JDBC URL', async function () {
            const connection = {
                connectionId: 'conn-123',
                name: 'Test Redshift Connection',
                type: 'RedshiftConnection',
                props: {
                    jdbcConnection: {
                        jdbcUrl: 'jdbc:redshift://test-cluster.123456789012.us-east-1.redshift.amazonaws.com:5439/dev',
                        dbname: 'test-db',
                    },
                    redshiftProperties: {},
                },
                location: {
                    awsAccountId: '',
                    awsRegion: 'us-east-1',
                },
            }

            const credentialsProvider = {
                getCredentials: async () => ({
                    accessKeyId: 'test-key',
                    secretAccessKey: 'test-secret',
                }),
            }

            mockSQLClient.executeQuery.resolves('query-id')
            mockSQLClient.getResources.resolves({
                resources: [
                    {
                        displayName: 'test-db',
                        type: 'DATABASE',
                        identifier: '',
                        childObjectTypes: [],
                    },
                ],
            })

            const node = createRedshiftConnectionNode(
                connection as any,
                credentialsProvider as ConnectionCredentialsProvider
            )

            assert.strictEqual(node.data.nodeType, NodeType.CONNECTION)
            assert.strictEqual(node.data.value.connection.name, 'Test Redshift Connection')

            // Test children provider - now creates database nodes directly
            const children = await node.getChildren()
            assert.strictEqual(children.length, 1)
            assert.strictEqual((children[0] as RedshiftNode).data.nodeType, NodeType.REDSHIFT_DATABASE)
        })

        it.skip('should create connection node with host from jdbcConnection', async function () {
            const connection = {
                connectionId: 'conn-123',
                name: 'Test Connection',
                type: 'RedshiftConnection',
                props: {
                    jdbcConnection: {
                        host: 'test-host.redshift.amazonaws.com',
                        dbname: 'test-db',
                    },
                    redshiftProperties: {},
                },
                location: {
                    awsAccountId: '',
                    awsRegion: 'us-east-1',
                },
            }

            const credentialsProvider = {
                getCredentials: async () => ({
                    accessKeyId: 'test-key',
                    secretAccessKey: 'test-secret',
                }),
            }

            mockSQLClient.executeQuery.resolves('query-id')
            mockSQLClient.getResources.resolves({ resources: [] })

            const node = createRedshiftConnectionNode(
                connection as any,
                credentialsProvider as ConnectionCredentialsProvider
            )
            const children = await node.getChildren()

            assert.strictEqual(children.length, 1)
            assert.strictEqual((children[0] as RedshiftNode).data.nodeType, NodeType.REDSHIFT_DATABASE)
        })

        it('should return placeholder when connection params are missing', async function () {
            const connection = {
                connectionId: 'conn-123',
                name: 'Test Connection',
                type: 'RedshiftConnection',
                props: {
                    jdbcConnection: {},
                    redshiftProperties: {},
                },
                location: {},
            }

            const credentialsProvider = {
                getCredentials: async () => ({
                    accessKeyId: 'test-key',
                    secretAccessKey: 'test-secret',
                }),
            }

            const node = createRedshiftConnectionNode(
                connection as any,
                credentialsProvider as ConnectionCredentialsProvider
            )
            const children = await node.getChildren()

            assert.strictEqual(children.length, 1)
            assert.strictEqual(children[0].resource, '[No data found]')
        })

        it.skip('should handle workgroup name in host', async function () {
            const connection = {
                connectionId: 'conn-123',
                name: 'Test Connection',
                type: 'RedshiftConnection',
                props: {
                    jdbcConnection: {
                        host: 'test-host.redshift-serverless.amazonaws.com',
                        dbname: 'test-db',
                    },
                    redshiftProperties: {
                        storage: {
                            workgroupName: 'test-workgroup',
                        },
                    },
                },
                location: {
                    awsAccountId: '',
                    awsRegion: 'us-east-1',
                },
            }

            const credentialsProvider = {
                getCredentials: async () => ({
                    accessKeyId: 'test-key',
                    secretAccessKey: 'test-secret',
                }),
            }

            mockSQLClient.executeQuery.resolves('query-id')
            mockSQLClient.getResources.resolves({ resources: [] })

            const node = createRedshiftConnectionNode(
                connection as any,
                credentialsProvider as ConnectionCredentialsProvider
            )
            const children = await node.getChildren()

            assert.strictEqual(children.length, 1)
        })

        it.skip('should handle connection errors gracefully', async function () {
            const connection = {
                connectionId: 'conn-123',
                name: 'Test Connection',
                type: 'RedshiftConnection',
                props: {
                    jdbcConnection: {
                        host: 'test-host.redshift.amazonaws.com',
                        dbname: 'test-db',
                    },
                },
                location: {
                    awsAccountId: '',
                    awsRegion: 'us-east-1',
                },
            }

            const credentialsProvider = {
                getCredentials: async () => ({
                    accessKeyId: 'test-key',
                    secretAccessKey: 'test-secret',
                }),
            }

            // Make createRedshiftConnectionConfig throw an error
            ;(sqlWorkbenchClient.createRedshiftConnectionConfig as sinon.SinonStub).rejects(
                new Error('Connection config failed')
            )

            const node = createRedshiftConnectionNode(
                connection as any,
                credentialsProvider as ConnectionCredentialsProvider
            )

            // The error should be handled gracefully and return an error node
            const children = await node.getChildren()
            assert.strictEqual(children.length, 1)
            assert.strictEqual((children[0] as any).id.includes('error'), true)
        })
    })
})
