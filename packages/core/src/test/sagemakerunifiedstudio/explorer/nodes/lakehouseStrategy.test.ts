/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import {
    LakehouseNode,
    createLakehouseConnectionNode,
} from '../../../../sagemakerunifiedstudio/explorer/nodes/lakehouseStrategy'
import { GlueCatalogClient } from '../../../../sagemakerunifiedstudio/shared/client/glueCatalogClient'
import { GlueClient } from '../../../../sagemakerunifiedstudio/shared/client/glueClient'
import { ConnectionClientStore } from '../../../../sagemakerunifiedstudio/shared/client/connectionClientStore'
import { NodeType } from '../../../../sagemakerunifiedstudio/explorer/nodes/types'
import { ConnectionCredentialsProvider } from '../../../../sagemakerunifiedstudio/auth/providers/connectionCredentialsProvider'

describe('LakehouseStrategy', function () {
    let sandbox: sinon.SinonSandbox
    let mockGlueCatalogClient: sinon.SinonStubbedInstance<GlueCatalogClient>
    let mockGlueClient: sinon.SinonStubbedInstance<GlueClient>

    const mockConnection = {
        connectionId: 'lakehouse-conn-123',
        name: 'test-lakehouse-connection',
        type: 'ATHENA',
        domainId: 'domain-123',
        projectId: 'project-123',
    }

    const mockCredentialsProvider = {
        getCredentials: async () => ({
            accessKeyId: 'test-key',
            secretAccessKey: 'test-secret',
            sessionToken: 'test-token',
        }),
        getDomainAccountId: async () => '123456789012',
    }

    beforeEach(function () {
        sandbox = sinon.createSandbox()

        mockGlueCatalogClient = {
            getCatalogs: sandbox.stub(),
        } as any

        mockGlueClient = {
            getDatabases: sandbox.stub(),
            getTables: sandbox.stub(),
            getTable: sandbox.stub(),
        } as any

        sandbox.stub(GlueCatalogClient, 'createWithCredentials').returns(mockGlueCatalogClient as any)
        sandbox.stub(GlueClient.prototype, 'getDatabases').callsFake(mockGlueClient.getDatabases)
        sandbox.stub(GlueClient.prototype, 'getTables').callsFake(mockGlueClient.getTables)
        sandbox.stub(GlueClient.prototype, 'getTable').callsFake(mockGlueClient.getTable)

        const mockClientStore = {
            getGlueClient: sandbox.stub().returns(mockGlueClient),
            getGlueCatalogClient: sandbox.stub().returns(mockGlueCatalogClient),
        }
        sandbox.stub(ConnectionClientStore, 'getInstance').returns(mockClientStore as any)
    })

    afterEach(function () {
        sandbox.restore()
    })

    describe('LakehouseNode', function () {
        it('should initialize with correct properties', function () {
            const nodeData = {
                id: 'test-node',
                nodeType: NodeType.CONNECTION,
                value: { test: 'value' },
            }

            const node = new LakehouseNode(nodeData)

            assert.strictEqual(node.id, 'test-node')
            assert.deepStrictEqual(node.resource, { test: 'value' })
        })

        it('should return empty array for leaf nodes', async function () {
            const nodeData = {
                id: 'leaf-node',
                nodeType: NodeType.REDSHIFT_COLUMN,
                value: {},
            }

            const node = new LakehouseNode(nodeData)
            const children = await node.getChildren()

            assert.strictEqual(children.length, 0)
        })

        it('should return error node when children provider fails', async function () {
            const nodeData = {
                id: 'error-node',
                nodeType: NodeType.CONNECTION,
                value: {},
            }

            const failingProvider = async () => {
                throw new Error('Provider failed')
            }

            const node = new LakehouseNode(nodeData, failingProvider)
            const children = await node.getChildren()

            assert.strictEqual(children.length, 1)
            assert.ok(children[0].id.startsWith('error-node-error-getChildren-'))
        })

        it('should create correct tree item for column node', async function () {
            const nodeData = {
                id: 'column-node',
                nodeType: NodeType.REDSHIFT_COLUMN,
                value: { name: 'test_column', type: 'varchar' },
            }

            const node = new LakehouseNode(nodeData)
            const treeItem = await node.getTreeItem()

            assert.strictEqual(treeItem.collapsibleState, vscode.TreeItemCollapsibleState.None)
            assert.strictEqual(treeItem.description, 'varchar')
        })

        it('should cache children after first load', async function () {
            const provider = sandbox
                .stub()
                .resolves([new LakehouseNode({ id: 'child', nodeType: NodeType.GLUE_DATABASE })])
            const node = new LakehouseNode({ id: 'parent', nodeType: NodeType.CONNECTION }, provider)

            await node.getChildren()
            await node.getChildren()

            assert.ok(provider.calledOnce)
        })
    })

    describe('createLakehouseConnectionNode', function () {
        it('should create connection node with correct structure', function () {
            const node = createLakehouseConnectionNode(
                mockConnection as any,
                mockCredentialsProvider as ConnectionCredentialsProvider,
                'us-east-1'
            )

            assert.strictEqual(node.id, 'lakehouse-conn-123')
            assert.strictEqual(node.data.nodeType, NodeType.CONNECTION)
            assert.strictEqual(node.data.path?.connection, 'test-lakehouse-connection')
        })

        it('should create AWS Data Catalog node for default connections', async function () {
            const defaultConnection = {
                ...mockConnection,
                name: 'project.default_lakehouse',
            }

            mockGlueCatalogClient.getCatalogs.resolves({ catalogs: [], nextToken: undefined })
            mockGlueClient.getDatabases.resolves({
                databases: [{ Name: 'default-db' }],
                nextToken: undefined,
            })

            const node = createLakehouseConnectionNode(
                defaultConnection as any,
                mockCredentialsProvider as ConnectionCredentialsProvider,
                'us-east-1'
            )
            const children = await node.getChildren()

            const awsDataCatalogNode = children.find((child) => child.id.includes('AwsDataCatalog')) as LakehouseNode
            assert.ok(awsDataCatalogNode)
            assert.strictEqual(awsDataCatalogNode.data.nodeType, NodeType.GLUE_CATALOG)
        })

        it('should not create AWS Data Catalog node for non-default connections', async function () {
            mockGlueCatalogClient.getCatalogs.resolves({ catalogs: [], nextToken: undefined })

            const node = createLakehouseConnectionNode(
                mockConnection as any,
                mockCredentialsProvider as ConnectionCredentialsProvider,
                'us-east-1'
            )
            const children = await node.getChildren()

            const awsDataCatalogNode = children.find((child) => child.id.includes('AwsDataCatalog'))
            assert.strictEqual(awsDataCatalogNode, undefined)
        })

        it('should handle errors gracefully', async function () {
            mockGlueCatalogClient.getCatalogs.rejects(new Error('Catalog error'))
            mockGlueClient.getDatabases.rejects(new Error('Database error'))

            const node = createLakehouseConnectionNode(
                mockConnection as any,
                mockCredentialsProvider as ConnectionCredentialsProvider,
                'us-east-1'
            )
            const children = await node.getChildren()

            assert.ok(children.length > 0)
            assert.ok(children.some((child) => child.id.startsWith('lakehouse-conn-123-error-')))
        })

        it('should create placeholder when no catalogs found', async function () {
            mockGlueCatalogClient.getCatalogs.resolves({ catalogs: [], nextToken: undefined })

            const node = createLakehouseConnectionNode(
                mockConnection as any,
                mockCredentialsProvider as ConnectionCredentialsProvider,
                'us-east-1'
            )
            const children = await node.getChildren()

            assert.ok(children.some((child) => child.resource === '[No data found]'))
        })
    })

    describe('Catalog nodes', function () {
        it('should create catalog nodes from API', async function () {
            mockGlueCatalogClient.getCatalogs.resolves({
                catalogs: [{ CatalogId: 'test-catalog', CatalogType: 'HIVE' }],
            })
            mockGlueClient.getDatabases.resolves({
                databases: [{ Name: 'test-db' }],
                nextToken: undefined,
            })

            const node = createLakehouseConnectionNode(
                mockConnection as any,
                mockCredentialsProvider as ConnectionCredentialsProvider,
                'us-east-1'
            )
            const children = await node.getChildren()

            assert.ok(children.length > 0)
            assert.ok(mockGlueCatalogClient.getCatalogs.called)
        })

        it('should handle catalog database pagination', async function () {
            const catalogNode = new LakehouseNode(
                {
                    id: 'catalog-node',
                    nodeType: NodeType.GLUE_CATALOG,
                    path: { catalog: 'test-catalog' },
                },
                async () => {
                    const allDatabases = []
                    let nextToken: string | undefined
                    do {
                        const { databases, nextToken: token } = await mockGlueClient.getDatabases(
                            'test-catalog',
                            undefined,
                            undefined,
                            nextToken
                        )
                        allDatabases.push(...databases)
                        nextToken = token
                    } while (nextToken)
                    return allDatabases.map(
                        (db) => new LakehouseNode({ id: db.Name || '', nodeType: NodeType.GLUE_DATABASE })
                    )
                }
            )

            mockGlueClient.getDatabases
                .onFirstCall()
                .resolves({ databases: [{ Name: 'db1' }], nextToken: 'token1' })
                .onSecondCall()
                .resolves({ databases: [{ Name: 'db2' }], nextToken: undefined })

            const children = await catalogNode.getChildren()

            assert.strictEqual(children.length, 2)
            assert.ok(mockGlueClient.getDatabases.calledTwice)
        })
    })

    describe('Database nodes', function () {
        it('should handle table pagination', async function () {
            const databaseNode = new LakehouseNode(
                {
                    id: 'database-node',
                    nodeType: NodeType.GLUE_DATABASE,
                    path: { catalog: 'test-catalog', database: 'test-db' },
                },
                async () => {
                    const allTables = []
                    let nextToken: string | undefined
                    do {
                        const { tables, nextToken: token } = await mockGlueClient.getTables(
                            'test-db',
                            'test-catalog',
                            undefined,
                            nextToken
                        )
                        allTables.push(...tables)
                        nextToken = token
                    } while (nextToken)
                    return allTables.map(
                        (table) => new LakehouseNode({ id: table.Name || '', nodeType: NodeType.GLUE_TABLE })
                    )
                }
            )

            mockGlueClient.getTables
                .onFirstCall()
                .resolves({ tables: [{ Name: 'table1' }], nextToken: 'token1' })
                .onSecondCall()
                .resolves({ tables: [{ Name: 'table2' }], nextToken: undefined })

            const children = await databaseNode.getChildren()

            assert.strictEqual(children.length, 2)
            assert.ok(mockGlueClient.getTables.calledTwice)
        })

        it('should handle AWS Data Catalog database queries', async function () {
            const databaseNode = new LakehouseNode(
                {
                    id: 'database-node',
                    nodeType: NodeType.GLUE_DATABASE,
                    path: { catalog: 'aws-data-catalog', database: 'test-db' },
                },
                async () => {
                    const catalogId = undefined
                    const { tables } = await mockGlueClient.getTables('test-db', catalogId)
                    return tables.map(
                        (table) => new LakehouseNode({ id: table.Name || '', nodeType: NodeType.GLUE_TABLE })
                    )
                }
            )

            mockGlueClient.getTables.resolves({ tables: [{ Name: 'aws-table' }], nextToken: undefined })

            const children = await databaseNode.getChildren()

            assert.strictEqual(children.length, 1)
            assert.ok(mockGlueClient.getTables.calledWith('test-db', undefined))
        })
    })

    describe('Table nodes', function () {
        it('should create table node and load columns', async function () {
            const tableNode = new LakehouseNode(
                {
                    id: 'table-node',
                    nodeType: NodeType.GLUE_TABLE,
                    path: { database: 'test-db', table: 'test-table' },
                },
                async () => {
                    const tableDetails = await mockGlueClient.getTable('test-db', 'test-table')
                    const columns = tableDetails?.StorageDescriptor?.Columns || []
                    const partitions = tableDetails?.PartitionKeys || []
                    return [...columns, ...partitions].map(
                        (col) =>
                            new LakehouseNode({
                                id: `column-${col.Name}`,
                                nodeType: NodeType.REDSHIFT_COLUMN,
                                value: { name: col.Name, type: col.Type },
                            })
                    )
                }
            )

            mockGlueClient.getTable.resolves({
                StorageDescriptor: {
                    Columns: [{ Name: 'col1', Type: 'string' }],
                },
                PartitionKeys: [{ Name: 'partition_col', Type: 'date' }],
                Name: undefined,
            })

            const children = await tableNode.getChildren()

            assert.strictEqual(children.length, 2)
            assert.ok(mockGlueClient.getTable.calledWith('test-db', 'test-table'))
        })

        it('should handle table with no columns', async function () {
            const tableNode = new LakehouseNode(
                {
                    id: 'empty-table-node',
                    nodeType: NodeType.GLUE_TABLE,
                    path: { database: 'test-db', table: 'empty-table' },
                },
                async () => {
                    const tableDetails = await mockGlueClient.getTable('test-db', 'empty-table')
                    const columns = tableDetails?.StorageDescriptor?.Columns || []
                    const partitions = tableDetails?.PartitionKeys || []
                    return [...columns, ...partitions].map(
                        (col) =>
                            new LakehouseNode({
                                id: `column-${col.Name}`,
                                nodeType: NodeType.REDSHIFT_COLUMN,
                                value: { name: col.Name, type: col.Type },
                            })
                    )
                }
            )

            mockGlueClient.getTable.resolves({
                StorageDescriptor: { Columns: [] },
                PartitionKeys: [],
                Name: undefined,
            })

            const children = await tableNode.getChildren()

            assert.strictEqual(children.length, 0)
        })

        it('should handle table getTable errors gracefully', async function () {
            const tableNode = new LakehouseNode(
                {
                    id: 'error-table-node',
                    nodeType: NodeType.GLUE_TABLE,
                    path: { database: 'test-db', table: 'error-table' },
                },
                async () => {
                    try {
                        await mockGlueClient.getTable('test-db', 'error-table')
                        return []
                    } catch (err) {
                        return []
                    }
                }
            )

            mockGlueClient.getTable.rejects(new Error('Table not found'))

            const children = await tableNode.getChildren()

            assert.strictEqual(children.length, 0)
        })
    })

    describe('Column nodes', function () {
        it('should create column node with correct properties', function () {
            const parentNode = new LakehouseNode({
                id: 'parent-table',
                nodeType: NodeType.GLUE_TABLE,
                path: { database: 'test-db', table: 'test-table' },
            })

            const columnNode = new LakehouseNode({
                id: 'parent-table/test-column',
                nodeType: NodeType.REDSHIFT_COLUMN,
                value: { name: 'test-column', type: 'varchar' },
                path: { database: 'test-db', table: 'test-table', column: 'test-column' },
                parent: parentNode,
            })

            assert.strictEqual(columnNode.id, 'parent-table/test-column')
            assert.strictEqual(columnNode.resource.name, 'test-column')
            assert.strictEqual(columnNode.resource.type, 'varchar')
            assert.strictEqual(columnNode.getParent(), parentNode)
        })
    })
})
