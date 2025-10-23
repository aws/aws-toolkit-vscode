/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'
import { getLogger } from '../../../shared/logger/logger'
import { DataZoneConnection } from '../../shared/client/datazoneClient'
import { GlueClient, ListEntitiesCommand, DescribeEntityCommand, Entity, Field } from '@aws-sdk/client-glue'
import { ConnectionCredentialsProvider } from '../../auth/providers/connectionCredentialsProvider'
import { getIcon } from '../../../shared/icons'
import { createPlaceholderItem } from '../../../shared/treeview/utils'
import { createErrorItem, createColumnTreeItem } from './utils'
import { NO_DATA_FOUND_MESSAGE, NodeType } from './types'

/**
 * Creates a federated connection node
 */
export async function createFederatedConnectionNode(
    connection: DataZoneConnection,
    connectionCredentialsProvider: ConnectionCredentialsProvider,
    region: string
): Promise<TreeNode> {
    const logger = getLogger()

    // Check for error message in glue properties
    // Create error node directly in this case
    const connectionError = connection.props?.glueProperties?.errorMessage
    if (connectionError) {
        return createErrorItem(connectionError, 'glue-error', connection.connectionId)
    }

    return {
        id: `federated-${connection.connectionId}`,
        resource: connection,
        getTreeItem: () => {
            const item = new vscode.TreeItem(connection.name, vscode.TreeItemCollapsibleState.Collapsed)
            item.contextValue = 'federatedConnection'
            item.iconPath = getIcon('aws-sagemakerunifiedstudio-catalog')
            item.tooltip = `Federated Connection: ${connection.name}`
            return item
        },
        getChildren: async () => {
            try {
                return await getFederatedEntities(connection, connectionCredentialsProvider, region)
            } catch (err) {
                logger.error(`Failed to get federated entities: ${(err as Error).message}`)
                const errorMessage = (err as Error).message
                void vscode.window.showErrorMessage(errorMessage)
                return [
                    createErrorItem(`Failed to load entities - ${errorMessage}`, 'entities', connection.connectionId),
                ]
            }
        },
        getParent: () => undefined,
    }
}

/**
 * Gets federated entities from Glue API
 */
async function getFederatedEntities(
    connection: DataZoneConnection,
    connectionCredentialsProvider: ConnectionCredentialsProvider,
    region: string
): Promise<TreeNode[]> {
    const awsCredentialProvider = async () => {
        const credentials = await connectionCredentialsProvider.getCredentials()
        return {
            accessKeyId: credentials.accessKeyId,
            secretAccessKey: credentials.secretAccessKey,
            sessionToken: credentials.sessionToken,
            expiration: credentials.expiration,
        }
    }
    const glueClient = new GlueClient({
        region: region,
        credentials: awsCredentialProvider,
    })

    const glueConnectionName = connection?.glueConnectionName
    if (!glueConnectionName) {
        return [createErrorItem('No Glue connection name found', 'glue-connection', connection.connectionId)]
    }

    const allEntities: Entity[] = []
    let nextToken: string | undefined

    do {
        const response = await glueClient.send(
            new ListEntitiesCommand({
                ConnectionName: glueConnectionName,
                NextToken: nextToken,
            })
        )

        if (response.Entities) {
            allEntities.push(...response.Entities)
        }
        nextToken = response.NextToken
    } while (nextToken)

    if (allEntities.length === 0) {
        return [createPlaceholderItem(NO_DATA_FOUND_MESSAGE)]
    }

    const entityNodes: TreeNode[] = []
    const tableNodes: TreeNode[] = []

    for (const entity of allEntities) {
        const nodeType = getGlueNodeType(entity.Category)
        const isTable = nodeType === NodeType.GLUE_TABLE

        const entityNode = createGlueEntityNode(entity, connection, glueClient, glueConnectionName)

        if (isTable) {
            tableNodes.push(entityNode)
        } else {
            entityNodes.push(entityNode)
        }
    }

    // Always group tables under a "Tables" container
    if (tableNodes.length > 0) {
        const tablesContainer = createTablesContainer(tableNodes, connection.connectionId)
        return [...entityNodes, tablesContainer]
    }

    return entityNodes
}

/**
 * Creates a Glue entity node
 */
function createGlueEntityNode(
    entity: Entity,
    connection: DataZoneConnection,
    glueClient: GlueClient,
    glueConnectionName: string
): TreeNode {
    const logger = getLogger()
    const nodeType = getGlueNodeType(entity.Category)
    const isTable = nodeType === NodeType.GLUE_TABLE

    return {
        id: `${connection.connectionId}-${entity.EntityName}`,
        resource: entity,
        getTreeItem: () => {
            const item = new vscode.TreeItem(
                entity.Label || entity.EntityName || 'Unknown',
                entity.IsParentEntity || (isTable && !entity.IsParentEntity)
                    ? vscode.TreeItemCollapsibleState.Collapsed
                    : vscode.TreeItemCollapsibleState.None
            )
            item.contextValue = nodeType
            item.iconPath = getGlueEntityIcon(nodeType)
            item.tooltip = `${entity.Category}: ${entity.Label || entity.EntityName}`
            return item
        },
        getChildren: async () => {
            try {
                if (entity.IsParentEntity) {
                    return await getChildEntities(entity, connection, glueClient, glueConnectionName)
                } else if (isTable) {
                    return await getTableColumns(entity, glueClient, glueConnectionName)
                }
                return []
            } catch (err) {
                logger.error(`Failed to get children for entity ${entity.EntityName}: ${(err as Error).message}`)
                const errorMessage = (err as Error).message
                void vscode.window.showErrorMessage(errorMessage)
                return [
                    createErrorItem(
                        `Failed to load children - ${errorMessage}`,
                        'entity-children',
                        entity.EntityName || 'unknown'
                    ),
                ]
            }
        },
        getParent: () => undefined,
    }
}

/**
 * Gets child entities for parent entities
 */
async function getChildEntities(
    parentEntity: Entity,
    connection: DataZoneConnection,
    glueClient: GlueClient,
    glueConnectionName: string
): Promise<TreeNode[]> {
    const allEntities: Entity[] = []
    let nextToken: string | undefined

    do {
        const response = await glueClient.send(
            new ListEntitiesCommand({
                ConnectionName: glueConnectionName,
                ParentEntityName: parentEntity.EntityName,
                NextToken: nextToken,
            })
        )

        if (response.Entities) {
            allEntities.push(...response.Entities)
        }
        nextToken = response.NextToken
    } while (nextToken)

    if (allEntities.length === 0) {
        return [createPlaceholderItem(NO_DATA_FOUND_MESSAGE)]
    }

    const entityNodes: TreeNode[] = []
    const tableNodes: TreeNode[] = []

    for (const entity of allEntities) {
        const nodeType = getGlueNodeType(entity.Category)
        const isTable = nodeType === NodeType.GLUE_TABLE
        const entityNode = createGlueEntityNode(entity, connection, glueClient, glueConnectionName)

        if (isTable) {
            tableNodes.push(entityNode)
        } else {
            entityNodes.push(entityNode)
        }
    }

    // Always group tables under a "Tables" container if there are any
    if (tableNodes.length > 0) {
        const tablesContainer = createTablesContainer(
            tableNodes,
            `${connection.connectionId}-${parentEntity.EntityName}`
        )
        return [...entityNodes, tablesContainer]
    }

    return entityNodes
}

/**
 * Gets table columns using DescribeEntity
 */
async function getTableColumns(
    entity: Entity,
    glueClient: GlueClient,
    glueConnectionName: string
): Promise<TreeNode[]> {
    const response = await glueClient.send(
        new DescribeEntityCommand({
            ConnectionName: glueConnectionName,
            EntityName: entity.EntityName,
        })
    )

    if (!response.Fields || response.Fields.length === 0) {
        return [createPlaceholderItem('No columns found')]
    }

    return response.Fields.map((field) => createColumnNode(field, entity.EntityName || 'unknown'))
}

/**
 * Creates a column node
 */
function createColumnNode(field: Field, tableName: string): TreeNode {
    return {
        id: `${tableName}-${field.FieldName}`,
        resource: field,
        getTreeItem: () => {
            return createColumnTreeItem(
                field.Label || field.FieldName || 'Unknown',
                field.FieldType || 'unknown',
                NodeType.REDSHIFT_COLUMN
            )
        },
        getChildren: async () => [],
        getParent: () => undefined,
    }
}

/**
 * Creates a tables container node
 */
function createTablesContainer(tableNodes: TreeNode[], connectionId: string): TreeNode {
    return {
        id: `${connectionId}-tables`,
        resource: {},
        getTreeItem: () => {
            const item = new vscode.TreeItem('Tables', vscode.TreeItemCollapsibleState.Collapsed)
            item.contextValue = NodeType.GLUE_TABLE
            item.iconPath = new vscode.ThemeIcon('table')
            return item
        },
        getChildren: async () => tableNodes,
        getParent: () => undefined,
    }
}

/**
 * Maps Glue entity category to node type
 */
function getGlueNodeType(category?: string): NodeType {
    const lowerCategory = category?.toLowerCase()
    if (lowerCategory?.includes('schema')) {
        return NodeType.GLUE_DATABASE
    } else if (lowerCategory?.includes('table')) {
        return NodeType.GLUE_TABLE
    } else if (lowerCategory?.includes('database')) {
        return NodeType.GLUE_DATABASE
    }
    return NodeType.GLUE_CATALOG
}

/**
 * Gets icon for Glue entity node type
 */
function getGlueEntityIcon(nodeType: NodeType): vscode.ThemeIcon | any {
    switch (nodeType) {
        case NodeType.GLUE_DATABASE:
            return new vscode.ThemeIcon('database')
        case NodeType.GLUE_TABLE:
            return getIcon('aws-redshift-table')
        case NodeType.GLUE_CATALOG:
            return getIcon('aws-sagemakerunifiedstudio-catalog')
        default:
            return getIcon('vscode-circle-outline')
    }
}
