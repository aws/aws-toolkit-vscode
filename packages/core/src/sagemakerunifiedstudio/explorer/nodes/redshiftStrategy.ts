/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'
import { getLogger } from '../../../shared/logger/logger'
import { DataZoneConnection } from '../../shared/client/datazoneClient'
import { ConnectionConfig, createRedshiftConnectionConfig } from '../../shared/client/sqlWorkbenchClient'
import { ConnectionClientStore } from '../../shared/client/connectionClientStore'
import { NODE_ID_DELIMITER, NodeType, ResourceType, NodeData, NO_DATA_FOUND_MESSAGE } from './types'
import {
    getLabel,
    isLeafNode,
    getIconForNodeType,
    createColumnTreeItem,
    isRedLakeDatabase,
    getTooltip,
    getColumnType,
    createErrorItem,
} from './utils'
import { createPlaceholderItem } from '../../../shared/treeview/utils'
import { ConnectionCredentialsProvider } from '../../auth/providers/connectionCredentialsProvider'
import { Catalog } from '@amzn/glue-catalog-client'
import { handleCredExpiredError } from '../../shared/credentialExpiryHandler'
import { telemetry } from '../../../shared/telemetry/telemetry'
import { recordDataConnectionTelemetry } from '../../shared/telemetry'

/**
 * Redshift data node for SageMaker Unified Studio
 */
export class RedshiftNode implements TreeNode {
    private childrenNodes: TreeNode[] | undefined
    private isLoading = false
    private readonly logger = getLogger('smus')

    constructor(
        public readonly data: NodeData,
        private readonly childrenProvider?: (node: RedshiftNode) => Promise<RedshiftNode[]>
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
                await handleCredExpiredError(err, true)
                return [createErrorItem(errorMessage, 'getChildren', this.id) as RedshiftNode]
            }
        }

        return []
    }

    public async getTreeItem(): Promise<vscode.TreeItem> {
        const label = getLabel(this.data)
        const isLeaf = isLeafNode(this.data)

        // For column nodes, create a TreeItem with label and description (column type)
        if (this.data.nodeType === NodeType.REDSHIFT_COLUMN && this.data.value?.type) {
            return createColumnTreeItem(label, this.data.value.type, this.data.nodeType)
        }

        // For other nodes, use standard TreeItem
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
 * Creates a Redshift connection node
 */
export function createRedshiftConnectionNode(
    connection: DataZoneConnection,
    connectionCredentialsProvider: ConnectionCredentialsProvider
): RedshiftNode {
    const logger = getLogger('smus')
    return new RedshiftNode(
        {
            id: connection.connectionId,
            nodeType: NodeType.CONNECTION,
            value: { connection, connectionCredentialsProvider },
            path: {
                connection: connection.name,
            },
        },
        async (node) => {
            return telemetry.smus_renderRedshiftNode.run(async (span) => {
                logger.info(`Loading Redshift resources for connection ${connection.name}`)
                await recordDataConnectionTelemetry(span, connection, connectionCredentialsProvider)

                const connectionParams = extractConnectionParams(connection)
                if (!connectionParams) {
                    return [createPlaceholderItem(NO_DATA_FOUND_MESSAGE) as RedshiftNode]
                }

                const isGlueCatalogDatabase = isRedLakeDatabase(connectionParams.database)

                // Create connection config with all available information
                const connectionConfig = await createRedshiftConnectionConfig(
                    connectionParams.host,
                    connectionParams.database,
                    connectionParams.accountId,
                    connectionParams.region,
                    connectionParams.secretArn,
                    isGlueCatalogDatabase
                )

                // Wake up the database with a simple query
                await wakeUpDatabase(
                    connectionConfig,
                    connectionParams.region,
                    connectionCredentialsProvider,
                    connection
                )

                const clientStore = ConnectionClientStore.getInstance()
                const sqlClient = clientStore.getSQLWorkbenchClient(
                    connection.connectionId,
                    connectionParams.region,
                    connectionCredentialsProvider
                )

                // Fetch Glue catalogs for filtering purposes only
                // This will help determine which catalogs are accessible within the project
                let glueCatalogs: Catalog[] = []
                try {
                    glueCatalogs = await listGlueCatalogs(
                        connection.connectionId,
                        connectionParams.region,
                        connectionCredentialsProvider
                    )
                } catch (err) {
                    logger.warn(`Failed to fetch Glue catalogs for filtering: ${(err as Error).message}`)
                }

                // Fetch databases and catalogs using getResources
                const [databasesResult, catalogsResult] = await Promise.allSettled([
                    fetchResources(sqlClient, connectionConfig, ResourceType.DATABASE),
                    fetchResources(sqlClient, connectionConfig, ResourceType.CATALOG),
                ])

                const databases = databasesResult.status === 'fulfilled' ? databasesResult.value : []
                const catalogs = catalogsResult.status === 'fulfilled' ? catalogsResult.value : []
                const allNodes: RedshiftNode[] = []

                // Filter databases
                const filteredDatabases = databases.filter(
                    (r: any) =>
                        r.type === ResourceType.DATABASE ||
                        r.type === ResourceType.EXTERNAL_DATABASE ||
                        r.type === ResourceType.SHARED_DATABASE
                )

                // Filter catalogs using listGlueCatalogs results
                const filteredCatalogs = catalogs.filter((catalog: any) => {
                    if (catalog.displayName?.toLowerCase() === 'awsdatacatalog') {
                        return true // Always include AWS Data Catalog
                    }
                    // Filter using Glue catalogs list
                    return glueCatalogs.some((glueCatalog) => catalog.displayName?.endsWith(glueCatalog.Name ?? ''))
                })

                // Add database nodes
                if (filteredDatabases.length === 0) {
                    if (databasesResult.status === 'rejected') {
                        const error = databasesResult.reason as Error
                        const errorMessage = `Failed to fetch databases - ${databasesResult.reason?.message || databasesResult.reason}.`
                        allNodes.push(createErrorItem(errorMessage, 'databases', node.id) as RedshiftNode)
                        await handleCredExpiredError(error, true)
                    } else {
                        allNodes.push(createPlaceholderItem(NO_DATA_FOUND_MESSAGE) as RedshiftNode)
                    }
                } else {
                    allNodes.push(
                        ...filteredDatabases.map((db: any) =>
                            createDatabaseNode(db.displayName, connectionConfig, node)
                        )
                    )
                }

                // Add catalog nodes
                if (filteredCatalogs.length === 0) {
                    if (catalogsResult.status === 'rejected') {
                        const error = catalogsResult.reason as Error
                        const errorMessage = `Failed to fetch catalogs - ${catalogsResult.reason?.message || catalogsResult.reason}`
                        allNodes.push(createErrorItem(errorMessage, 'catalogs', node.id) as RedshiftNode)
                        await handleCredExpiredError(error, true)
                    } else {
                        allNodes.push(createPlaceholderItem(NO_DATA_FOUND_MESSAGE) as RedshiftNode)
                    }
                } else {
                    allNodes.push(
                        ...filteredCatalogs.map((catalog: any) =>
                            createCatalogNode(
                                catalog.displayName || catalog.identifier || '',
                                catalog,
                                connectionConfig,
                                node
                            )
                        )
                    )
                }

                return allNodes
            })
        }
    )
}

/**
 * Extracts connection parameters from DataZone connection
 */
function extractConnectionParams(connection: DataZoneConnection) {
    const redshiftProps = connection.props?.redshiftProperties || {}
    const jdbcConnection = connection.props?.jdbcConnection || {}

    let host = jdbcConnection.host
    if (!host && jdbcConnection.jdbcUrl) {
        // Example: jdbc:redshift://test-cluster.123456789012.us-east-1.redshift.amazonaws.com:5439/dev
        // match[0] = entire URL, match[1] = host, match[2] = port, match[3] = database
        const match = jdbcConnection.jdbcUrl.match(/jdbc:redshift:\/\/([^:]+):(\d+)\/(.+)/)
        if (match) {
            host = match[1]
        }
    }

    const database = jdbcConnection.dbname || redshiftProps.databaseName
    const secretArn = jdbcConnection.secretId || redshiftProps.credentials?.secretArn
    const accountId = connection.location?.awsAccountId
    const region = connection.location?.awsRegion

    if (!host || !database || !accountId || !region) {
        return undefined
    }

    return { host, database, secretArn, accountId, region }
}

/**
 * Wake up the database with a simple query
 */
async function wakeUpDatabase(
    connectionConfig: ConnectionConfig,
    region: string,
    connectionCredentialsProvider: ConnectionCredentialsProvider,
    connection: DataZoneConnection
) {
    const logger = getLogger('smus')
    const clientStore = ConnectionClientStore.getInstance()
    const sqlClient = clientStore.getSQLWorkbenchClient(connection.connectionId, region, connectionCredentialsProvider)
    try {
        await sqlClient.executeQuery(connectionConfig, 'select 1 from sys_query_history limit 1;')
    } catch (e) {
        logger.debug(`Wake-up query failed: ${(e as Error).message}`)
    }
}

/**
 * Creates a database node
 */
function createDatabaseNode(
    databaseName: string,
    connectionConfig: ConnectionConfig,
    parent: RedshiftNode
): RedshiftNode {
    const logger = getLogger('smus')

    return new RedshiftNode(
        {
            id: databaseName,
            nodeType: NodeType.REDSHIFT_DATABASE,
            value: {
                database: databaseName,
                connectionConfig,
                identifier: databaseName,
                type: ResourceType.DATABASE,
                childObjectTypes: [ResourceType.SCHEMA, ResourceType.EXTERNAL_SCHEMA, ResourceType.SHARED_SCHEMA],
            },
            path: {
                ...parent.data.path,
                database: databaseName,
            },
            parent,
        },
        async (node) => {
            try {
                // Get the original credentials from the root connection node
                const rootCredentials = getRootCredentials(parent)

                // Create SQL client with the original credentials
                const clientStore = ConnectionClientStore.getInstance()
                const sqlClient = clientStore.getSQLWorkbenchClient(
                    connectionConfig.id,
                    connectionConfig.id.split(':')[3], // region
                    rootCredentials
                )

                // Update connection config with the database
                const dbConnectionConfig = {
                    ...connectionConfig,
                    database: databaseName,
                }

                // Get schemas
                const allResources = []
                let nextToken: string | undefined

                do {
                    const response = await sqlClient.getResources({
                        connection: dbConnectionConfig,
                        resourceType: ResourceType.SCHEMA,
                        includeChildren: true,
                        maxItems: 100,
                        parents: [
                            {
                                parentId: databaseName,
                                parentType: ResourceType.DATABASE,
                            },
                        ],
                        forceRefresh: true,
                        pageToken: nextToken,
                    })
                    allResources.push(...(response.resources || []))
                    nextToken = response.nextToken
                } while (nextToken)

                const schemas = allResources.filter(
                    (r: any) =>
                        r.type === ResourceType.SCHEMA ||
                        r.type === ResourceType.EXTERNAL_SCHEMA ||
                        r.type === ResourceType.SHARED_SCHEMA
                )

                if (schemas.length === 0) {
                    return [createPlaceholderItem(NO_DATA_FOUND_MESSAGE) as RedshiftNode]
                }

                // Map schemas to nodes
                return schemas.map((schema: any) => createSchemaNode(schema.displayName, dbConnectionConfig, node))
            } catch (err) {
                logger.error(`Failed to get schemas: ${(err as Error).message}`)
                const errorMessage = (err as Error).message
                await handleCredExpiredError(err, true)
                return [createErrorItem(errorMessage, 'schemas', node.id) as RedshiftNode]
            }
        }
    )
}

/**
 * Creates a schema node
 */
function createSchemaNode(schemaName: string, connectionConfig: ConnectionConfig, parent: RedshiftNode): RedshiftNode {
    const logger = getLogger('smus')

    return new RedshiftNode(
        {
            id: schemaName,
            nodeType: NodeType.REDSHIFT_SCHEMA,
            value: {
                schema: schemaName,
                connectionConfig,
                identifier: schemaName,
                type: ResourceType.SCHEMA,
                childObjectTypes: [
                    ResourceType.TABLE,
                    ResourceType.VIEW,
                    ResourceType.FUNCTION,
                    ResourceType.STORED_PROCEDURE,
                    ResourceType.EXTERNAL_TABLE,
                    ResourceType.CATALOG_TABLE,
                    ResourceType.DATA_CATALOG_TABLE,
                ],
            },
            path: {
                ...parent.data.path,
                schema: schemaName,
            },
            parent,
        },
        async (node) => {
            try {
                // Get the original credentials from the root connection node
                const rootCredentials = getRootCredentials(parent)

                // Create SQL client with the original credentials
                const clientStore = ConnectionClientStore.getInstance()
                const rootConnection = getRootConnection(parent)
                const sqlClient = clientStore.getSQLWorkbenchClient(
                    rootConnection.connectionId,
                    connectionConfig.id.split(':')[3], // region
                    rootCredentials
                )

                // Get schema objects
                // Make sure we're using the correct database in the connection config
                const databaseName = parent.data.path?.database || connectionConfig.database
                if (!databaseName) {
                    logger.error('Database name is required but was not found in path or connection config')
                    return [createErrorItem('Database name is missing', 'schema-contents', node.id) as RedshiftNode]
                }

                const schemaConnectionConfig = {
                    ...connectionConfig,
                    database: databaseName,
                }

                // Create request params object for logging
                const requestParams = {
                    connection: schemaConnectionConfig,
                    resourceType: ResourceType.TABLE,
                    includeChildren: true,
                    maxItems: 100,
                    parents: [
                        {
                            parentId: schemaName,
                            parentType: ResourceType.SCHEMA,
                        },
                        {
                            parentId: databaseName,
                            parentType: ResourceType.DATABASE,
                        },
                    ],
                    forceRefresh: true,
                }

                const allResources = []
                let nextToken: string | undefined

                do {
                    const response = await sqlClient.getResources({
                        ...requestParams,
                        pageToken: nextToken,
                    })
                    allResources.push(...(response.resources || []))
                    nextToken = response.nextToken
                } while (nextToken)

                // Group resources by type
                const tables = allResources.filter(
                    (r: any) =>
                        r.type === ResourceType.TABLE ||
                        r.type === ResourceType.EXTERNAL_TABLE ||
                        r.type === ResourceType.CATALOG_TABLE ||
                        r.type === ResourceType.DATA_CATALOG_TABLE
                )
                const views = allResources.filter((r: any) => r.type === ResourceType.VIEW)
                const functions = allResources.filter((r: any) => r.type === ResourceType.FUNCTION)
                const procedures = allResources.filter((r: any) => r.type === ResourceType.STORED_PROCEDURE)

                // Create container nodes for each type
                const containerNodes: RedshiftNode[] = []

                // Tables container
                if (tables.length > 0) {
                    containerNodes.push(createContainerNode(NodeType.REDSHIFT_TABLE, tables, connectionConfig, node))
                }

                // Views container
                if (views.length > 0) {
                    containerNodes.push(createContainerNode(NodeType.REDSHIFT_VIEW, views, connectionConfig, node))
                }

                // Functions container
                if (functions.length > 0) {
                    containerNodes.push(
                        createContainerNode(NodeType.REDSHIFT_FUNCTION, functions, connectionConfig, node)
                    )
                }

                // Stored procedures container
                if (procedures.length > 0) {
                    containerNodes.push(
                        createContainerNode(NodeType.REDSHIFT_STORED_PROCEDURE, procedures, connectionConfig, node)
                    )
                }

                if (containerNodes.length === 0) {
                    return [createPlaceholderItem(NO_DATA_FOUND_MESSAGE) as RedshiftNode]
                }

                return containerNodes
            } catch (err) {
                logger.error(`Failed to get schema contents: ${(err as Error).message}`)
                const errorMessage = (err as Error).message
                await handleCredExpiredError(err, true)
                return [createErrorItem(errorMessage, 'schema-contents', node.id) as RedshiftNode]
            }
        }
    )
}

/**
 * Creates a container node for grouping objects by type
 */
function createContainerNode(
    nodeType: NodeType,
    resources: any[],
    connectionConfig: ConnectionConfig,
    parent: RedshiftNode
): RedshiftNode {
    return new RedshiftNode(
        {
            id: `${parent.id}${NODE_ID_DELIMITER}${nodeType}-container`,
            nodeType: nodeType,
            value: {
                connectionConfig,
                resources,
            },
            path: parent.data.path,
            parent,
            isContainer: true,
        },
        async (node) => {
            // Map resources to nodes
            if (nodeType === NodeType.REDSHIFT_TABLE && parent.data.value?.type === ResourceType.CATALOG_DATABASE) {
                // For catalog tables, use catalog table node
                return resources.length > 0
                    ? resources.map((resource: any) =>
                          createCatalogTableNode(resource.displayName, resource, connectionConfig, node)
                      )
                    : [createPlaceholderItem(NO_DATA_FOUND_MESSAGE) as RedshiftNode]
            }
            return resources.length > 0
                ? resources.map((resource: any) =>
                      createObjectNode(resource.displayName, nodeType, resource, connectionConfig, node)
                  )
                : [createPlaceholderItem(NO_DATA_FOUND_MESSAGE) as RedshiftNode]
        }
    )
}

/**
 * Creates an object node (table, view, function, etc.)
 */
function createObjectNode(
    name: string,
    nodeType: NodeType,
    resource: any,
    connectionConfig: ConnectionConfig,
    parent: RedshiftNode
): RedshiftNode {
    const logger = getLogger('smus')

    return new RedshiftNode(
        {
            id: `${parent.id}${NODE_ID_DELIMITER}${name}`,
            nodeType: nodeType,
            value: {
                ...resource,
                connectionConfig,
            },
            path: {
                ...parent.data.path,
                [nodeType]: name,
            },
            parent,
        },
        async (node) => {
            // Only tables have columns
            if (nodeType !== NodeType.REDSHIFT_TABLE) {
                return []
            }

            try {
                // Get the original credentials from the root connection node
                const rootCredentials = getRootCredentials(parent)

                // Create SQL client with the original credentials
                const clientStore = ConnectionClientStore.getInstance()
                const rootConnection = getRootConnection(parent)
                const sqlClient = clientStore.getSQLWorkbenchClient(
                    rootConnection.connectionId,
                    connectionConfig.id.split(':')[3], // region
                    rootCredentials
                )

                // Get schema and database from path
                const schemaName = node.data.path?.schema
                const databaseName = node.data.path?.database
                const tableName = node.data.path?.table

                if (!schemaName || !databaseName || !tableName) {
                    logger.error('Missing schema, database, or table name in path')
                    return []
                }

                // Create request params for getResources to get columns
                const requestParams = {
                    connection: connectionConfig,
                    resourceType: ResourceType.COLUMNS,
                    includeChildren: true,
                    maxItems: 100,
                    parents: [
                        {
                            parentId: tableName,
                            parentType: ResourceType.TABLE,
                        },
                        {
                            parentId: schemaName,
                            parentType: ResourceType.SCHEMA,
                        },
                        {
                            parentId: databaseName,
                            parentType: ResourceType.DATABASE,
                        },
                    ],
                    forceRefresh: true,
                }

                // Call getResources to get columns
                const allColumns = []
                let nextToken: string | undefined

                do {
                    const response = await sqlClient.getResources({
                        ...requestParams,
                        pageToken: nextToken,
                    })
                    allColumns.push(...(response.resources || []))
                    nextToken = response.nextToken
                } while (nextToken)

                // Create column nodes from API response
                return allColumns.length > 0
                    ? allColumns.map((column: any) => {
                          // Extract column type from resourceMetadata
                          let columnType = 'UNKNOWN'
                          if (column.resourceMetadata && Array.isArray(column.resourceMetadata)) {
                              const typeMetadata = column.resourceMetadata.find(
                                  (meta: any) => meta.key === 'COLUMN_TYPE'
                              )
                              if (typeMetadata) {
                                  columnType = typeMetadata.value
                              }
                          }

                          columnType = getColumnType(columnType)

                          return createColumnNode(
                              column.displayName,
                              {
                                  name: column.displayName,
                                  type: columnType,
                              },
                              connectionConfig,
                              node
                          )
                      })
                    : [createPlaceholderItem(NO_DATA_FOUND_MESSAGE) as RedshiftNode]
            } catch (err) {
                logger.error(`Failed to get columns: ${(err as Error).message}`)
                const errorMessage = (err as Error).message
                await handleCredExpiredError(err, true)
                return [createErrorItem(errorMessage, 'columns', node.id) as RedshiftNode]
            }
        }
    )
}

/**
 * Creates a column node
 */
function createColumnNode(
    name: string,
    columnInfo: { name: string; type: string },
    connectionConfig: ConnectionConfig,
    parent: RedshiftNode
): RedshiftNode {
    return new RedshiftNode({
        id: `${parent.id}${NODE_ID_DELIMITER}${name}`,
        nodeType: NodeType.REDSHIFT_COLUMN,
        value: {
            name,
            type: columnInfo.type,
            connectionConfig,
        },
        path: {
            ...parent.data.path,
            column: name,
        },
        parent,
    })
}

/**
 * Gets the root connection from a node
 */
function getRootConnection(node: RedshiftNode): DataZoneConnection {
    // Start with the current node
    let currentNode = node

    // Traverse up to the root connection node
    while (currentNode.data.parent) {
        currentNode = currentNode.data.parent
    }

    // Get connection from the root node
    return currentNode.data.value?.connection
}

/**
 * Gets the original credentials from the root connection node
 */
function getRootCredentials(node: RedshiftNode): ConnectionCredentialsProvider {
    // Start with the current node
    let currentNode = node

    // Traverse up to the root connection node
    while (currentNode.data.parent) {
        currentNode = currentNode.data.parent
    }

    // Get credentials from the root node
    const credentials = currentNode.data.value?.connectionCredentialsProvider

    // Return credentials or fallback to dummy credentials
    return (
        credentials || {
            accessKeyId: 'dummy',
            secretAccessKey: 'dummy',
        }
    )
}

/**
 * Fetch glue catalogs, this will help determine which catalogs are accessible within the project
 */
async function listGlueCatalogs(
    connectionId: string,
    region: string,
    connectionCredentialsProvider: ConnectionCredentialsProvider
): Promise<Catalog[]> {
    const clientStore = ConnectionClientStore.getInstance()
    const glueCatalogClient = clientStore.getGlueCatalogClient(connectionId, region, connectionCredentialsProvider)

    const allCatalogs = []
    let nextToken: string | undefined

    do {
        const { catalogs, nextToken: token } = await glueCatalogClient.getCatalogs(nextToken)
        allCatalogs.push(...catalogs)
        nextToken = token
    } while (nextToken)

    return allCatalogs
}

/**
 * Main logic to fetch catalog and database resources using getResources
 */
async function fetchResources(
    sqlClient: any,
    connectionConfig: ConnectionConfig,
    resourceType: ResourceType,
    parents: any[] = []
): Promise<any[]> {
    const allResources = []
    let nextToken: string | undefined

    do {
        const requestParams = {
            connection: connectionConfig,
            resourceType,
            includeChildren: true,
            maxItems: 100,
            parents,
            forceRefresh: true,
            pageToken: nextToken,
        }
        const response = await sqlClient.getResources(requestParams)
        allResources.push(...(response.resources || []))
        nextToken = response.nextToken
    } while (nextToken)

    return allResources
}

/**
 * Creates a catalog database node
 */
function createCatalogDatabaseNode(
    databaseName: string,
    database: any,
    connectionConfig: ConnectionConfig,
    parent: RedshiftNode
): RedshiftNode {
    return new RedshiftNode(
        {
            id: `${parent.id}${NODE_ID_DELIMITER}${databaseName}`,
            nodeType: NodeType.REDSHIFT_CATALOG_DATABASE,
            value: {
                ...database,
                connectionConfig,
                identifier: databaseName,
                type: ResourceType.CATALOG_DATABASE,
            },
            path: {
                ...parent.data.path,
                database: databaseName,
            },
            parent,
        },
        async (node) => {
            try {
                const rootCredentials = getRootCredentials(parent)
                const clientStore = ConnectionClientStore.getInstance()
                const rootConnection = getRootConnection(parent)
                const sqlClient = clientStore.getSQLWorkbenchClient(
                    rootConnection.connectionId,
                    connectionConfig.id.split(':')[3],
                    rootCredentials
                )

                // Use getResources to fetch tables within this catalog database
                const tables = await fetchResources(sqlClient, connectionConfig, ResourceType.CATALOG_TABLE, [
                    {
                        parentId: database.identifier,
                        parentType: ResourceType.CATALOG_DATABASE,
                    },
                    {
                        parentId: parent.data.value?.catalog?.identifier || parent.data.path?.catalog,
                        parentType: ResourceType.CATALOG,
                    },
                ])

                if (tables.length === 0) {
                    return [createPlaceholderItem(NO_DATA_FOUND_MESSAGE) as RedshiftNode]
                }

                // Create container node for tables
                return [createContainerNode(NodeType.REDSHIFT_TABLE, tables, connectionConfig, node)]
            } catch (err) {
                const errorMessage = (err as Error).message
                await handleCredExpiredError(err, true)
                return [createErrorItem(errorMessage, 'catalog-tables', node.id) as RedshiftNode]
            }
        }
    )
}

/**
 * Creates a catalog table node
 */
function createCatalogTableNode(
    tableName: string,
    table: any,
    connectionConfig: ConnectionConfig,
    parent: RedshiftNode
): RedshiftNode {
    return new RedshiftNode(
        {
            id: `${parent.id}${NODE_ID_DELIMITER}${tableName}`,
            nodeType: NodeType.REDSHIFT_TABLE,
            value: {
                ...table,
                connectionConfig,
            },
            path: {
                ...parent.data.path,
                table: tableName,
            },
            parent,
        },
        async (node) => {
            try {
                const rootCredentials = getRootCredentials(parent)
                const clientStore = ConnectionClientStore.getInstance()
                const rootConnection = getRootConnection(parent)
                const sqlClient = clientStore.getSQLWorkbenchClient(
                    rootConnection.connectionId,
                    connectionConfig.id.split(':')[3],
                    rootCredentials
                )

                // Use getResources to fetch columns within this catalog table
                // Need to traverse up to find the actual database and catalog nodes
                let databaseNode = parent
                while (databaseNode && databaseNode.data.nodeType !== NodeType.REDSHIFT_CATALOG_DATABASE) {
                    databaseNode = databaseNode.data.parent
                }

                let catalogNode = databaseNode?.data.parent
                while (catalogNode && catalogNode.data.nodeType !== NodeType.REDSHIFT_CATALOG) {
                    catalogNode = catalogNode.data.parent
                }

                const parents = [
                    {
                        parentId: table.identifier,
                        parentType: ResourceType.CATALOG_TABLE,
                    },
                    {
                        parentId: databaseNode?.data.value?.identifier,
                        parentType: ResourceType.CATALOG_DATABASE,
                    },
                    {
                        parentId: catalogNode?.data.value?.catalog?.identifier || catalogNode?.data.value?.identifier,
                        parentType: ResourceType.CATALOG,
                    },
                ]

                const columns = await fetchResources(sqlClient, connectionConfig, ResourceType.CATALOG_COLUMN, parents)

                return columns.length > 0
                    ? columns.map((column: any) => {
                          let columnType = 'UNKNOWN'
                          if (column.resourceMetadata && Array.isArray(column.resourceMetadata)) {
                              const typeMetadata = column.resourceMetadata.find(
                                  (meta: any) => meta.key === 'COLUMN_TYPE'
                              )
                              if (typeMetadata) {
                                  columnType = typeMetadata.value
                              }
                          }

                          columnType = getColumnType(columnType)

                          return createColumnNode(
                              column.displayName,
                              {
                                  name: column.displayName,
                                  type: columnType,
                              },
                              connectionConfig,
                              node
                          )
                      })
                    : [createPlaceholderItem(NO_DATA_FOUND_MESSAGE) as RedshiftNode]
            } catch (err) {
                const errorMessage = (err as Error).message
                await handleCredExpiredError(err, true)
                return [createErrorItem(errorMessage, 'catalog-columns', node.id) as RedshiftNode]
            }
        }
    )
}

/**
 * Creates a catalog node
 */
function createCatalogNode(
    catalogName: string,
    catalog: any,
    connectionConfig: ConnectionConfig,
    parent: RedshiftNode
): RedshiftNode {
    return new RedshiftNode(
        {
            id: `${parent.id}${NODE_ID_DELIMITER}${catalogName}`,
            nodeType: NodeType.REDSHIFT_CATALOG,
            value: {
                catalog,
                catalogName,
                connectionConfig,
                identifier: catalogName,
                type: ResourceType.CATALOG,
            },
            path: {
                ...parent.data.path,
                catalog: catalogName,
            },
            parent,
        },
        async (node) => {
            try {
                const rootCredentials = getRootCredentials(parent)
                const clientStore = ConnectionClientStore.getInstance()
                const rootConnection = getRootConnection(parent)
                const sqlClient = clientStore.getSQLWorkbenchClient(
                    rootConnection.connectionId,
                    connectionConfig.id.split(':')[3],
                    rootCredentials
                )

                // Use getResources to fetch databases within this catalog
                const databases = await fetchResources(sqlClient, connectionConfig, ResourceType.CATALOG_DATABASE, [
                    {
                        parentId: catalog.identifier,
                        parentType: ResourceType.CATALOG,
                    },
                ])

                if (databases.length === 0) {
                    return [createPlaceholderItem(NO_DATA_FOUND_MESSAGE) as RedshiftNode]
                }

                return databases.length > 0
                    ? databases.map((database: any) =>
                          createCatalogDatabaseNode(database.displayName, database, connectionConfig, node)
                      )
                    : [createPlaceholderItem(NO_DATA_FOUND_MESSAGE) as RedshiftNode]
            } catch (err) {
                const errorMessage = (err as Error).message
                await handleCredExpiredError(err, true)
                return [createErrorItem(errorMessage, 'catalog-databases', node.id) as RedshiftNode]
            }
        }
    )
}
