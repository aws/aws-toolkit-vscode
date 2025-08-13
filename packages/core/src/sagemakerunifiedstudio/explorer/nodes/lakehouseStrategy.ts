/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'
import { getLogger } from '../../../shared/logger/logger'
import { DataZoneConnection } from '../../shared/client/datazoneClient'
import { GlueCatalogClient } from '../../shared/client/glueCatalogClient'
import { GlueClient } from '../../shared/client/glueClient'
import {
    NODE_ID_DELIMITER,
    NodeType,
    NodeData,
    DATA_DEFAULT_LAKEHOUSE_CONNECTION_NAME,
    DATA_DEFAULT_ATHENA_CONNECTION_NAME,
    DATA_DEFAULT_IAM_CONNECTION_NAME,
    AWS_DATA_CATALOG,
} from './types'
import { getLabel, isLeafNode, getIconForNodeType, getTooltip, createColumnTreeItem, getColumnType } from './utils'
import { AwsCredentialIdentity } from '@aws-sdk/types/dist-types/identity/AwsCredentialIdentity'
import { Column } from '@aws-sdk/client-glue'

/**
 * Lakehouse data node for SageMaker Unified Studio
 */
export class LakehouseNode implements TreeNode {
    private childrenNodes: TreeNode[] | undefined
    private isLoading = false
    private readonly logger = getLogger()

    constructor(
        public readonly data: NodeData,
        private readonly childrenProvider?: (node: LakehouseNode) => Promise<LakehouseNode[]>
    ) {}

    public get id(): string {
        return this.data.id
    }

    public get resource(): any {
        return this.data.value || {}
    }

    public async getChildren(): Promise<TreeNode[]> {
        // Return cached children if available
        if (this.childrenNodes && !this.isLoading) {
            return this.childrenNodes
        }

        // Return empty array for leaf nodes
        if (isLeafNode(this.data)) {
            return []
        }

        // If we have a children provider, use it
        if (this.childrenProvider) {
            try {
                this.isLoading = true
                const childrenNodes = await this.childrenProvider(this)
                this.childrenNodes = childrenNodes
                this.isLoading = false
                return this.childrenNodes
            } catch (err) {
                this.isLoading = false
                this.logger.error(`Failed to get children for node ${this.data.id}: ${(err as Error).message}`)

                return [createErrorNode(`${this.id}${NODE_ID_DELIMITER}error`, err as Error, this)]
            }
        }

        return []
    }

    public async getTreeItem(): Promise<vscode.TreeItem> {
        const label = getLabel(this.data)
        const isLeaf = isLeafNode(this.data)

        // For column nodes, show type as secondary text
        if (this.data.nodeType === NodeType.REDSHIFT_COLUMN && this.data.value?.type) {
            return createColumnTreeItem(label, this.data.value.type, this.data.nodeType)
        }

        const collapsibleState = isLeaf
            ? vscode.TreeItemCollapsibleState.None
            : vscode.TreeItemCollapsibleState.Collapsed

        const item = new vscode.TreeItem(label, collapsibleState)

        // Set icon based on node type
        item.iconPath = getIconForNodeType(this.data.nodeType, this.data.isContainer)

        // Set context value for command enablement
        item.contextValue = this.data.nodeType

        // Set tooltip
        item.tooltip = getTooltip(this.data)

        return item
    }

    public getParent(): TreeNode | undefined {
        return this.data.parent
    }
}

/**
 * Creates a Lakehouse connection node
 */
export function createLakehouseConnectionNode(
    connection: DataZoneConnection,
    credentials: AwsCredentialIdentity,
    region: string
): LakehouseNode {
    const logger = getLogger()

    // Create Glue clients
    const glueCatalogClient = GlueCatalogClient.createWithCredentials(region, credentials)
    const glueClient = new GlueClient(region, credentials)

    // Create the connection node
    return new LakehouseNode(
        {
            id: connection.connectionId,
            nodeType: NodeType.CONNECTION,
            value: { connection },
            path: {
                connection: connection.name,
            },
        },
        async (node) => {
            try {
                logger.info(`Loading Lakehouse catalogs for connection ${connection.name}`)

                // Check if this is a default connection
                const isDefaultConnection =
                    connection.name.startsWith(DATA_DEFAULT_LAKEHOUSE_CONNECTION_NAME) ||
                    connection.name.startsWith(DATA_DEFAULT_ATHENA_CONNECTION_NAME) ||
                    connection.name.startsWith(DATA_DEFAULT_IAM_CONNECTION_NAME)

                // Follow the reference pattern with Promise.allSettled
                const [awsDataCatalogResult, catalogsResult] = await Promise.allSettled([
                    // AWS Data Catalog node (only for default connections)
                    isDefaultConnection
                        ? Promise.resolve([createAwsDataCatalogNode(node, glueClient)])
                        : Promise.resolve([]),
                    // Get catalogs by calling Glue API
                    getCatalogs(glueCatalogClient, glueClient, node),
                ])

                const awsDataCatalog = awsDataCatalogResult.status === 'fulfilled' ? awsDataCatalogResult.value : []
                const apiCatalogs = catalogsResult.status === 'fulfilled' ? catalogsResult.value : []
                const errors: LakehouseNode[] = []

                if (awsDataCatalogResult.status === 'rejected') {
                    errors.push(
                        createErrorNode(
                            `${node.id}${NODE_ID_DELIMITER}aws-catalog-error`,
                            awsDataCatalogResult.reason as Error,
                            node
                        )
                    )
                }

                if (catalogsResult.status === 'rejected') {
                    errors.push(
                        createErrorNode(
                            `${node.id}${NODE_ID_DELIMITER}catalogs-error`,
                            catalogsResult.reason as Error,
                            node
                        )
                    )
                }

                const allNodes = [...awsDataCatalog, ...apiCatalogs, ...errors]
                return allNodes.length > 0 ? allNodes : [createEmptyNode(`${node.id}${NODE_ID_DELIMITER}empty`, node)]
            } catch (err) {
                logger.error(`Failed to get Lakehouse catalogs: ${(err as Error).message}`)
                throw err
            }
        }
    )
}

/**
 * Creates AWS Data Catalog node for default connections
 */
function createAwsDataCatalogNode(parent: LakehouseNode, glueClient: GlueClient): LakehouseNode {
    return new LakehouseNode(
        {
            id: `${parent.id}${NODE_ID_DELIMITER}${AWS_DATA_CATALOG}`,
            nodeType: NodeType.GLUE_CATALOG,
            value: {
                catalog: { name: AWS_DATA_CATALOG, type: 'AWS' },
                catalogName: AWS_DATA_CATALOG,
            },
            path: {
                ...parent.data.path,
                catalog: AWS_DATA_CATALOG,
            },
            parent,
        },
        async (node) => {
            const allDatabases = []
            let nextToken: string | undefined

            do {
                const { databases, nextToken: token } = await glueClient.getDatabases(undefined, nextToken)
                allDatabases.push(...databases)
                nextToken = token
            } while (nextToken)

            return allDatabases.map((database) => createDatabaseNode(database.Name || '', database, glueClient, node))
        }
    )
}

/**
 * Gets catalogs from the GlueCatalogClient
 */
async function getCatalogs(
    glueCatalogClient: GlueCatalogClient,
    glueClient: GlueClient,
    parent: LakehouseNode
): Promise<LakehouseNode[]> {
    const catalogs = await glueCatalogClient.getCatalogs()
    return catalogs.map((catalog) => createCatalogNode(catalog.name, catalog, glueClient, parent))
}

/**
 * Creates a catalog node
 */
function createCatalogNode(
    catalogName: string,
    catalog: any,
    glueClient: GlueClient,
    parent: LakehouseNode
): LakehouseNode {
    const logger = getLogger()

    return new LakehouseNode(
        {
            id: catalogName,
            nodeType: NodeType.GLUE_CATALOG,
            value: {
                catalog,
                catalogName,
            },
            path: {
                ...parent.data.path,
                catalog: catalogName,
            },
            parent,
        },
        async (node) => {
            try {
                logger.info(`Loading databases for catalog ${catalogName}`)

                const allDatabases = []
                let nextToken: string | undefined

                do {
                    const { databases, nextToken: token } = await glueClient.getDatabases(catalogName, nextToken)
                    allDatabases.push(...databases)
                    nextToken = token
                } while (nextToken)

                return allDatabases.map((database) =>
                    createDatabaseNode(database.Name || '', database, glueClient, node)
                )
            } catch (err) {
                logger.error(`Failed to get databases for catalog ${catalogName}: ${(err as Error).message}`)
                throw err
            }
        }
    )
}

/**
 * Creates a database node
 */
function createDatabaseNode(
    databaseName: string,
    database: any,
    glueClient: GlueClient,
    parent: LakehouseNode
): LakehouseNode {
    const logger = getLogger()

    return new LakehouseNode(
        {
            id: databaseName,
            nodeType: NodeType.GLUE_DATABASE,
            value: {
                database,
                databaseName,
            },
            path: {
                ...parent.data.path,
                database: databaseName,
            },
            parent,
        },
        async (node) => {
            try {
                logger.info(`Loading tables for database ${databaseName}`)

                const allTables = []
                let nextToken: string | undefined
                const catalogId = parent.data.path?.catalog === AWS_DATA_CATALOG ? undefined : parent.data.path?.catalog

                do {
                    const { tables, nextToken: token } = await glueClient.getTables(databaseName, catalogId, nextToken)
                    allTables.push(...tables)
                    nextToken = token
                } while (nextToken)

                return allTables.map((table) => createTableNode(table.Name || '', table, glueClient, node))
            } catch (err) {
                logger.error(`Failed to get tables for database ${databaseName}: ${(err as Error).message}`)
                throw err
            }
        }
    )
}

/**
 * Creates a table node
 */
function createTableNode(tableName: string, table: any, glueClient: GlueClient, parent: LakehouseNode): LakehouseNode {
    const logger = getLogger()

    return new LakehouseNode(
        {
            id: tableName,
            nodeType: NodeType.GLUE_TABLE,
            value: {
                table,
                tableName,
            },
            path: {
                ...parent.data.path,
                table: tableName,
            },
            parent,
        },
        async (node) => {
            try {
                logger.info(`Loading columns for table ${tableName}`)

                const databaseName = node.data.path?.database || ''
                const tableDetails = await glueClient.getTable(databaseName, tableName)
                const columns = tableDetails?.StorageDescriptor?.Columns || []
                const partitions = tableDetails?.PartitionKeys || []

                return [...columns, ...partitions].map((column) => createColumnNode(column.Name || '', column, node))
            } catch (err) {
                logger.error(`Failed to get columns for table ${tableName}: ${(err as Error).message}`)
                return []
            }
        }
    )
}

/**
 * Creates a column node
 */
function createColumnNode(columnName: string, column: Column, parent: LakehouseNode): LakehouseNode {
    const columnType = getColumnType(column?.Type)

    return new LakehouseNode({
        id: `${parent.id}${NODE_ID_DELIMITER}${columnName}`,
        nodeType: NodeType.REDSHIFT_COLUMN,
        value: {
            name: columnName,
            type: columnType,
        },
        path: {
            ...parent.data.path,
            column: columnName,
        },
        parent,
    })
}

/**
 * Creates an error node
 */
function createErrorNode(id: string, error: Error, parent?: LakehouseNode): LakehouseNode {
    return new LakehouseNode({
        id,
        nodeType: NodeType.ERROR,
        value: error,
        parent,
    })
}

/**
 * Creates an empty node
 */
function createEmptyNode(id: string, parent?: LakehouseNode): LakehouseNode {
    return new LakehouseNode({
        id,
        nodeType: NodeType.EMPTY,
        value: 'No catalogs found',
        parent,
    })
}
