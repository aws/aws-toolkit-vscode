/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'
import { getLogger } from '../../../shared/logger/logger'
import { DataZoneConnection } from '../../shared/client/datazoneClient'
import { GlueCatalog, GlueCatalogClient } from '../../shared/client/glueCatalogClient'
import { GlueClient } from '../../shared/client/glueClient'
import { ConnectionClientStore } from '../../shared/client/connectionClientStore'
import {
    NODE_ID_DELIMITER,
    NodeType,
    NodeData,
    DATA_DEFAULT_LAKEHOUSE_CONNECTION_NAME_REGEXP,
    DATA_DEFAULT_ATHENA_CONNECTION_NAME_REGEXP,
    DATA_DEFAULT_IAM_CONNECTION_NAME_REGEXP,
    AWS_DATA_CATALOG,
    DatabaseObjects,
    NO_DATA_FOUND_MESSAGE,
} from './types'
import {
    getLabel,
    isLeafNode,
    getIconForNodeType,
    getTooltip,
    createColumnTreeItem,
    getColumnType,
    createErrorItem,
} from './utils'
import { createPlaceholderItem } from '../../../shared/treeview/utils'
import { Column, Database, Table } from '@aws-sdk/client-glue'
import { ConnectionCredentialsProvider } from '../../auth/providers/connectionCredentialsProvider'
import { telemetry } from '../../../shared/telemetry/telemetry'
import { getContext } from '../../../shared/vscode/setContext'

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

                const errorMessage = (err as Error).message
                void vscode.window.showErrorMessage(errorMessage)
                return [createErrorItem(errorMessage, 'getChildren', this.id) as LakehouseNode]
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
    connectionCredentialsProvider: ConnectionCredentialsProvider,
    region: string
): LakehouseNode {
    const logger = getLogger()

    // Create Glue clients
    const clientStore = ConnectionClientStore.getInstance()
    const glueCatalogClient = clientStore.getGlueCatalogClient(
        connection.connectionId,
        region,
        connectionCredentialsProvider
    )
    const glueClient = clientStore.getGlueClient(connection.connectionId, region, connectionCredentialsProvider)

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
            return telemetry.smus_renderLakehouseNode.run(async (span) => {
                const isInSmusSpace = getContext('aws.smus.inSmusSpaceEnvironment')

                span.record({
                    smusToolkitEnv: isInSmusSpace ? 'smus_space' : 'local',
                    smusDomainId: connection.domainId,
                    smusProjectId: connection.projectId,
                    smusConnectionId: connection.connectionId,
                    smusConnectionType: connection.type,
                    smusProjectRegion: connection.location?.awsRegion,
                })
                try {
                    logger.info(`Loading Lakehouse catalogs for connection ${connection.name}`)

                    // Check if this is a default connection
                    const isDefaultConnection =
                        DATA_DEFAULT_IAM_CONNECTION_NAME_REGEXP.test(connection.name) ||
                        DATA_DEFAULT_LAKEHOUSE_CONNECTION_NAME_REGEXP.test(connection.name) ||
                        DATA_DEFAULT_ATHENA_CONNECTION_NAME_REGEXP.test(connection.name)

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
                        const errorMessage = (awsDataCatalogResult.reason as Error).message
                        void vscode.window.showErrorMessage(errorMessage)
                        errors.push(createErrorItem(errorMessage, 'aws-data-catalog', node.id) as LakehouseNode)
                    }

                    if (catalogsResult.status === 'rejected') {
                        const errorMessage = (catalogsResult.reason as Error).message
                        void vscode.window.showErrorMessage(errorMessage)
                        errors.push(createErrorItem(errorMessage, 'catalogs', node.id) as LakehouseNode)
                    }

                    const allNodes = [...awsDataCatalog, ...apiCatalogs, ...errors]
                    return allNodes.length > 0
                        ? allNodes
                        : [createPlaceholderItem(NO_DATA_FOUND_MESSAGE) as LakehouseNode]
                } catch (err) {
                    logger.error(`Failed to get Lakehouse catalogs: ${(err as Error).message}`)
                    const errorMessage = (err as Error).message
                    void vscode.window.showErrorMessage(errorMessage)
                    return [createErrorItem(errorMessage, 'lakehouse-catalogs', node.id) as LakehouseNode]
                }
            })
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
                const { databases, nextToken: token } = await glueClient.getDatabases(
                    undefined,
                    'ALL',
                    ['NAME'],
                    nextToken
                )
                allDatabases.push(...databases)
                nextToken = token
            } while (nextToken)

            return allDatabases.length > 0
                ? allDatabases.map((database) => createDatabaseNode(database.Name || '', database, glueClient, node))
                : [createPlaceholderItem(NO_DATA_FOUND_MESSAGE) as LakehouseNode]
        }
    )
}

export interface CatalogTree {
    parent: GlueCatalog
    children?: GlueCatalog[]
}

/**
 * Builds catalog tree from flat catalog list
 *
 * AWS Glue catalogs can have parent-child relationships, but the API returns them as a flat list.
 * This function reconstructs the hierarchical tree structure needed for proper UI display.
 *
 * Two-pass algorithm is required because:
 * 1. First pass: Create a lookup map of all catalogs by name for O(1) access during relationship building
 * 2. Second pass: Build parent-child relationships by linking catalogs that reference ParentCatalogNames
 *
 * Without the first pass, we'd need O(n²) time to find parent catalogs for each child catalog.
 */
function buildCatalogTree(catalogs: GlueCatalog[]): CatalogTree[] {
    const catalogMap: Record<string, CatalogTree> = {}
    const rootCatalogs: CatalogTree[] = []

    // First pass: create a map of all catalogs with their metadata
    // This allows us to quickly look up any catalog by name when building parent-child relationships in the second pass
    for (const catalog of catalogs) {
        if (catalog.Name) {
            catalogMap[catalog.Name] = { parent: catalog, children: [] }
        }
    }

    // Second pass: build the hierarchical tree structure by linking children to their parents
    // Catalogs with ParentCatalogNames become children, others become root-level catalogs
    for (const catalog of catalogs) {
        if (catalog.Name) {
            if (catalog.ParentCatalogNames && catalog.ParentCatalogNames.length > 0) {
                const parentName = catalog.ParentCatalogNames[0]
                const parent = catalogMap[parentName]
                if (parent) {
                    if (!parent.children) {
                        parent.children = []
                    }
                    parent.children.push(catalog)
                }
            } else {
                rootCatalogs.push(catalogMap[catalog.Name])
            }
        }
    }
    rootCatalogs.sort((a, b) => {
        const timeA = new Date(a.parent.CreateTime ?? 0).getTime()
        const timeB = new Date(b.parent.CreateTime ?? 0).getTime()
        return timeA - timeB // For oldest first
    })

    return rootCatalogs
}

/**
 * Gets catalogs from the GlueCatalogClient
 */
async function getCatalogs(
    glueCatalogClient: GlueCatalogClient,
    glueClient: GlueClient,
    parent: LakehouseNode
): Promise<LakehouseNode[]> {
    const allCatalogs = []
    let nextToken: string | undefined

    do {
        const { catalogs, nextToken: token } = await glueCatalogClient.getCatalogs(nextToken)
        allCatalogs.push(...catalogs)
        nextToken = token
    } while (nextToken)

    const catalogs = allCatalogs
    const tree = buildCatalogTree(catalogs)

    return tree.map((catalog) => {
        const parentCatalog = catalog.parent

        // If parent catalog has children, create node that shows child catalogs
        if (catalog.children && catalog.children.length > 0) {
            return new LakehouseNode(
                {
                    id: parentCatalog.Name || parentCatalog.CatalogId || '',
                    nodeType: NodeType.GLUE_CATALOG,
                    value: {
                        catalog: parentCatalog,
                        catalogName: parentCatalog.Name || '',
                    },
                    path: {
                        ...parent.data.path,
                        catalog: parentCatalog.CatalogId || '',
                    },
                    parent,
                },
                async (node: LakehouseNode) => {
                    // Parent catalogs only show child catalogs
                    const childCatalogs =
                        catalog.children?.map((childCatalog) =>
                            createCatalogNode(childCatalog.CatalogId || '', childCatalog, glueClient, node, false)
                        ) || []
                    return childCatalogs
                }
            )
        }

        // For catalogs without children, create regular catalog node
        return createCatalogNode(parentCatalog.CatalogId || '', parentCatalog, glueClient, parent, false)
    })
}

/**
 * Creates a catalog node
 */
function createCatalogNode(
    catalogId: string,
    catalog: GlueCatalog,
    glueClient: GlueClient,
    parent: LakehouseNode,
    isParent: boolean = false
): LakehouseNode {
    const logger = getLogger()

    return new LakehouseNode(
        {
            id: catalog.Name || catalogId,
            nodeType: NodeType.GLUE_CATALOG,
            value: {
                catalog,
                catalogName: catalog.Name || catalogId,
            },
            path: {
                ...parent.data.path,
                catalog: catalogId,
            },
            parent,
        },
        // Child catalogs load databases, parent catalogs will have their children provider overridden
        isParent
            ? async () => [] // Placeholder, will be overridden for parent catalogs with children
            : async (node) => {
                  try {
                      logger.info(`Loading databases for catalog ${catalogId}`)

                      const allDatabases = []
                      let nextToken: string | undefined

                      do {
                          const { databases, nextToken: token } = await glueClient.getDatabases(
                              catalogId,
                              undefined,
                              ['NAME'],
                              nextToken
                          )
                          allDatabases.push(...databases)
                          nextToken = token
                      } while (nextToken)

                      return allDatabases.length > 0
                          ? allDatabases.map((database) =>
                                createDatabaseNode(database.Name || '', database, glueClient, node)
                            )
                          : [createPlaceholderItem(NO_DATA_FOUND_MESSAGE) as LakehouseNode]
                  } catch (err) {
                      logger.error(`Failed to get databases for catalog ${catalogId}: ${(err as Error).message}`)
                      const errorMessage = (err as Error).message
                      void vscode.window.showErrorMessage(errorMessage)
                      return [createErrorItem(errorMessage, 'catalog-databases', node.id) as LakehouseNode]
                  }
              }
    )
}

/**
 * Creates a database node
 */
function createDatabaseNode(
    databaseName: string,
    database: Database,
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
                    const { tables, nextToken: token } = await glueClient.getTables(
                        databaseName,
                        catalogId,
                        ['NAME', 'TABLE_TYPE'],
                        nextToken
                    )
                    allTables.push(...tables)
                    nextToken = token
                } while (nextToken)

                // Group tables and views separately
                const tables = allTables.filter((table) => table.TableType !== DatabaseObjects.VIRTUAL_VIEW)
                const views = allTables.filter((table) => table.TableType === DatabaseObjects.VIRTUAL_VIEW)

                const containerNodes: LakehouseNode[] = []

                // Create tables container if there are tables
                if (tables.length > 0) {
                    containerNodes.push(createContainerNode(NodeType.GLUE_TABLE, tables, glueClient, node))
                }

                // Create views container if there are views
                if (views.length > 0) {
                    containerNodes.push(createContainerNode(NodeType.GLUE_VIEW, views, glueClient, node))
                }

                return containerNodes.length > 0
                    ? containerNodes
                    : [createPlaceholderItem(NO_DATA_FOUND_MESSAGE) as LakehouseNode]
            } catch (err) {
                logger.error(`Failed to get tables for database ${databaseName}: ${(err as Error).message}`)
                const errorMessage = (err as Error).message
                void vscode.window.showErrorMessage(errorMessage)
                return [createErrorItem(errorMessage, 'database-tables', node.id) as LakehouseNode]
            }
        }
    )
}

/**
 * Creates a table node
 */
function createTableNode(
    tableName: string,
    table: Table,
    glueClient: GlueClient,
    parent: LakehouseNode
): LakehouseNode {
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
                const catalogId = node.data.path?.catalog === AWS_DATA_CATALOG ? undefined : node.data.path?.catalog
                const tableDetails = await glueClient.getTable(databaseName, tableName, catalogId)
                const columns = tableDetails?.StorageDescriptor?.Columns || []
                const partitions = tableDetails?.PartitionKeys || []

                const allColumns = [...columns, ...partitions]
                return allColumns.length > 0
                    ? allColumns.map((column) => createColumnNode(column.Name || '', column, node))
                    : [createPlaceholderItem(NO_DATA_FOUND_MESSAGE) as LakehouseNode]
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
 * Creates a container node for grouping objects by type
 */
function createContainerNode(
    nodeType: NodeType,
    items: Table[],
    glueClient: GlueClient,
    parent: LakehouseNode
): LakehouseNode {
    return new LakehouseNode(
        {
            id: `${parent.id}${NODE_ID_DELIMITER}${nodeType}-container`,
            nodeType: nodeType,
            value: {
                items,
            },
            path: parent.data.path,
            parent,
            isContainer: true,
        },
        async (node) => {
            // Map items to nodes
            return items.length > 0
                ? items.map((item) => createTableNode(item.Name || '', item, glueClient, node))
                : [createPlaceholderItem(NO_DATA_FOUND_MESSAGE) as LakehouseNode]
        }
    )
}
