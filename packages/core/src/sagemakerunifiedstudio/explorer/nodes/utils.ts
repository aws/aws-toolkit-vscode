/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getIcon, IconPath, addColor } from '../../../shared/icons'
import { TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'
import {
    NODE_ID_DELIMITER,
    NodeType,
    RedshiftServiceModelUrl,
    RedshiftType,
    ConnectionType,
    NodeData,
    LEAF_NODE_TYPES,
    DATA_DEFAULT_LAKEHOUSE_CONNECTION_NAME_REGEXP,
    redshiftColumnTypes,
    lakeHouseColumnTypes,
    glueConnectionTypes,
} from './types'
import { DataZoneClient, DataZoneConnection } from '../../shared/client/datazoneClient'
import { getContext } from '../../../shared/vscode/setContext'
import { SmusAuthenticationProvider } from '../../auth/providers/smusAuthenticationProvider'
import { SmusIamConnection } from '../../auth/model'
import { ConnectionStatus } from '@aws-sdk/client-datazone'

/**
 * Polling interval in milliseconds for checking space status updates
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const PENDING_NODE_POLLING_INTERVAL_MS = 5000

/**
 * Polling interval in milliseconds for checking space status updates
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export const PENDING_NODE_POLLING_INTERVAL_MS = 5000

/**
 * Gets the label for a node based on its data
 */
export function getLabel(data: {
    id: string
    nodeType: NodeType
    isContainer?: boolean
    path?: { key?: string; label?: string }
    value?: any
}): string {
    // For S3 access grant nodes, use S3 (label) format
    if (data.nodeType === NodeType.S3_ACCESS_GRANT && data.path?.label) {
        return `S3 (${data.path.label})`
    }

    // For connection nodes, use the connection name
    if (data.nodeType === NodeType.CONNECTION && data.value?.connection?.name) {
        if (
            data.value?.connection?.type === ConnectionType.LAKEHOUSE &&
            DATA_DEFAULT_LAKEHOUSE_CONNECTION_NAME_REGEXP.test(data.value?.connection?.name)
        ) {
            if (getContext('aws.smus.isExpressMode')) {
                return 'Catalogs'
            }
            return 'Lakehouse'
        }
        const formattedType = data.value?.connection?.type?.replace(/([A-Z]+(?:_[A-Z]+)*)/g, (match: string) => {
            const words = match.split('_')
            return words.map((word: string) => word.charAt(0) + word.slice(1).toLowerCase()).join(' ')
        })
        return `${formattedType} (${data.value.connection.name})`
    }

    // For container nodes, use the node type
    if (data.isContainer) {
        switch (data.nodeType) {
            case NodeType.REDSHIFT_TABLE:
                return 'Tables'
            case NodeType.REDSHIFT_VIEW:
                return 'Views'
            case NodeType.REDSHIFT_FUNCTION:
                return 'Functions'
            case NodeType.REDSHIFT_STORED_PROCEDURE:
                return 'Stored Procedures'
            default:
                return data.nodeType
        }
    }

    // For path-based nodes, use the last part of the path
    if (data.path?.label) {
        return data.path.label
    }

    // For S3 folders, add a trailing slash
    if (data.nodeType === NodeType.S3_FOLDER) {
        const key = data.path?.key || ''
        const parts = key.split('/')
        return parts[parts.length - 2] + '/'
    }

    // For S3 files, use the filename
    if (data.nodeType === NodeType.S3_FILE) {
        const key = data.path?.key || ''
        const parts = key.split('/')
        return parts[parts.length - 1]
    }

    // For other nodes, use the last part of the ID
    const parts = data.id.split(NODE_ID_DELIMITER)
    return parts[parts.length - 1]
}

/**
 * Determines if a node is a leaf node
 */
export function isLeafNode(data: { nodeType: NodeType; isContainer?: boolean }): boolean {
    // Container nodes are never leaf nodes
    if (data.isContainer) {
        return false
    }

    return LEAF_NODE_TYPES.includes(data.nodeType)
}

/**
 * Gets the icon for a node type
 */
export function getIconForNodeType(nodeType: NodeType, isContainer?: boolean): vscode.ThemeIcon | IconPath | undefined {
    switch (nodeType) {
        case NodeType.CONNECTION:
        case NodeType.S3_ACCESS_GRANT:
            return undefined
        case NodeType.S3_BUCKET:
            return getIcon('aws-s3-bucket')
        case NodeType.S3_FOLDER:
            return getIcon('vscode-folder')
        case NodeType.S3_FILE:
            return getIcon('vscode-file')
        case NodeType.REDSHIFT_CLUSTER:
            return getIcon('aws-redshift-cluster')
        case NodeType.REDSHIFT_DATABASE:
        case NodeType.GLUE_DATABASE:
            return new vscode.ThemeIcon('database')
        case NodeType.REDSHIFT_SCHEMA:
            return getIcon('aws-redshift-schema')
        case NodeType.REDSHIFT_TABLE:
        case NodeType.GLUE_TABLE:
            return isContainer ? new vscode.ThemeIcon('table') : getIcon('aws-redshift-table')
        case NodeType.REDSHIFT_VIEW:
            return isContainer ? new vscode.ThemeIcon('list-tree') : new vscode.ThemeIcon('eye')
        case NodeType.REDSHIFT_FUNCTION:
        case NodeType.REDSHIFT_STORED_PROCEDURE:
            return isContainer ? new vscode.ThemeIcon('list-tree') : new vscode.ThemeIcon('symbol-method')
        case NodeType.GLUE_CATALOG:
            return getIcon('aws-sagemakerunifiedstudio-catalog')
        case NodeType.REDSHIFT_CATALOG:
            return new vscode.ThemeIcon('database')
        case NodeType.REDSHIFT_CATALOG_DATABASE:
            return getIcon('aws-redshift-schema')
        case NodeType.ERROR:
            return new vscode.ThemeIcon('error')
        case NodeType.LOADING:
            return new vscode.ThemeIcon('loading~spin')
        case NodeType.EMPTY:
            return new vscode.ThemeIcon('info')
        default:
            return getIcon('vscode-circle-outline')
    }
}

/**
 * Creates a standard tree item for a node
 */
export function createTreeItem(
    label: string,
    nodeType: NodeType,
    isLeaf: boolean,
    isContainer?: boolean,
    tooltip?: string
): vscode.TreeItem {
    const collapsibleState = isLeaf ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed

    const item = new vscode.TreeItem(label, collapsibleState)

    // Set icon based on node type
    item.iconPath = getIconForNodeType(nodeType, isContainer)

    // Set context value for command enablement
    item.contextValue = nodeType

    // Set tooltip if provided
    if (tooltip) {
        item.tooltip = tooltip
    }

    return item
}

/**
 * Gets the column type category from a raw column type string
 */
export function getColumnType(columnTypeString?: string): string {
    if (!columnTypeString) {
        return 'UNKNOWN'
    }

    const lowerType = columnTypeString.toLowerCase()

    // Search in both redshift and lakehouse column types
    const allTypes = [...Object.values(redshiftColumnTypes).flat(), ...Object.values(lakeHouseColumnTypes).flat()].map(
        (type) => type.toLowerCase()
    )

    return allTypes.find((key) => lowerType.startsWith(key)) || 'UNKNOWN'
}

/**
 * Gets the icon for a column based on its type
 */
function getColumnIcon(columnType: string): vscode.ThemeIcon | IconPath {
    const upperType = columnType.toUpperCase()

    // Check if it's a numeric type
    if (
        lakeHouseColumnTypes.NUMERIC.some((type) => upperType.includes(type)) ||
        redshiftColumnTypes.NUMERIC.some((type) => upperType.includes(type))
    ) {
        return getIcon('aws-sagemakerunifiedstudio-symbol-int')
    }

    // Check if it's a string type
    if (
        lakeHouseColumnTypes.STRING.some((type) => upperType.includes(type)) ||
        redshiftColumnTypes.STRING.some((type) => upperType.includes(type))
    ) {
        return getIcon('vscode-symbol-key')
    }

    // Check if it's a time type
    if (
        lakeHouseColumnTypes.TIME.some((type) => upperType.includes(type)) ||
        redshiftColumnTypes.TIME.some((type) => upperType.includes(type))
    ) {
        return getIcon('vscode-calendar')
    }

    // Check if it's a boolean type
    if (
        lakeHouseColumnTypes.BOOLEAN.some((type) => upperType.includes(type)) ||
        redshiftColumnTypes.BOOLEAN.some((type) => upperType.includes(type))
    ) {
        return getIcon('vscode-symbol-boolean')
    }

    // Default icon for unknown types
    return new vscode.ThemeIcon('symbol-field')
}

/**
 * Creates a tree item for a column node with type information
 */
export function createColumnTreeItem(label: string, columnType: string, nodeType: NodeType): vscode.TreeItem {
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None)

    // Add column type as description (secondary text)
    item.description = columnType

    // Set icon based on column type
    item.iconPath = getColumnIcon(columnType)

    // Set context value for command enablement
    item.contextValue = nodeType

    // Set tooltip
    item.tooltip = `${label}: ${columnType}`

    return item
}

/**
 * Creates an error node
 */
export function createErrorTreeItem(message: string): vscode.TreeItem {
    const item = new vscode.TreeItem(message, vscode.TreeItemCollapsibleState.None)
    item.iconPath = new vscode.ThemeIcon('error')
    return item
}

/**
 * Creates an error item with unique ID and proper styling
 */
export function createErrorItem(message: string, context: string, parentId: string): TreeNode {
    return {
        id: `${parentId}-error-${context}-${Date.now()}`,
        resource: message,
        getTreeItem: () => {
            const item = new vscode.TreeItem(message, vscode.TreeItemCollapsibleState.None)
            item.iconPath = addColor(getIcon('vscode-error'), 'testing.iconErrored')
            return item
        },
    }
}

export const isRedLakeDatabase = (databaseName?: string) => {
    if (!databaseName) {
        return false
    }
    const regex = /[\w\d\-_]+@[\w\d\-_]+/gs
    return regex.test(databaseName)
}

/**
 * Gets the tooltip for a node
 * @param data The node data
 * @returns The tooltip text
 */
export function getTooltip(data: NodeData): string {
    const label = getLabel(data)

    switch (data.nodeType) {
        // Common node types
        case NodeType.CONNECTION:
            return data.connectionType === ConnectionType.REDSHIFT
                ? `Redshift Connection: ${label}`
                : `Connection: ${label}\nType: ${data.connectionType}`

        // S3 node types
        case NodeType.S3_BUCKET:
            return `S3 Bucket: ${data.path?.bucket}`
        case NodeType.S3_FOLDER:
            return `Folder: ${label}\nBucket: ${data.path?.bucket}`
        case NodeType.S3_FILE:
            return `File: ${label}\nBucket: ${data.path?.bucket}`

        // Redshift node types
        case NodeType.REDSHIFT_CLUSTER:
            return `Redshift Cluster: ${label}`
        case NodeType.REDSHIFT_DATABASE:
            return `Database: ${label}`
        case NodeType.REDSHIFT_SCHEMA:
            return `Schema: ${label}`
        case NodeType.REDSHIFT_TABLE:
            return data.isContainer ? `Tables in ${data.path?.schema}` : `Table: ${data.path?.schema}.${label}`
        case NodeType.REDSHIFT_VIEW:
            return data.isContainer ? `Views in ${data.path?.schema}` : `View: ${data.path?.schema}.${label}`
        case NodeType.REDSHIFT_FUNCTION:
            return data.isContainer ? `Functions in ${data.path?.schema}` : `Function: ${data.path?.schema}.${label}`
        case NodeType.REDSHIFT_STORED_PROCEDURE:
            return data.isContainer
                ? `Stored Procedures in ${data.path?.schema}`
                : `Stored Procedure: ${data.path?.schema}.${label}`

        // Glue node types
        case NodeType.GLUE_CATALOG:
            return `Glue Catalog: ${label}`
        case NodeType.GLUE_DATABASE:
            return `Glue Database: ${label}`
        case NodeType.GLUE_TABLE:
            return `Glue Table: ${label}`

        // Default
        default:
            return label
    }
}

/**
 * Gets the Redshift type from a host
 * @param host Redshift host
 * @returns Redshift type or null if not recognized
 */
export function getRedshiftTypeFromHost(host?: string): RedshiftType | undefined {
    /*
      'default-workgroup.{accountID}.us-west-2.redshift-serverless.amazonaws.com' - SERVERLESS
      'default-rs-cluster.{id}.us-west-2.redshift.amazonaws.com' - CLUSTER
      'default-rs-cluster.{id}.us-west-2.redshift.amazonaws.com:5439/dev' - CLUSTER
     */
    if (!host) {
        return undefined
    }

    const cleanHost = host.split(':')[0]
    const parts = cleanHost.split('.')
    if (parts.length < 3) {
        return undefined
    }

    const domain = parts.slice(parts.length - 3).join('.')

    if (domain === RedshiftServiceModelUrl.REDSHIFT_SERVERLESS_URL) {
        return RedshiftType.Serverless
    } else if (domain === RedshiftServiceModelUrl.REDSHIFT_CLUSTER_URL) {
        return RedshiftType.Cluster
    } else {
        return undefined
    }
}

/**
 * This function searches for property keys that end with "Properties" (like "snowflakeProperties",
 * "redshiftProperties", "athenaProperties") and returns the actual property object, not just the key name.
 * It only works for connections that have a glueConnectionName, indicating they are federated connections.
 *
 * @param connection - The DataZone connection object to search
 * @returns The property object (not the key name) if found, undefined otherwise
 *
 * @example
 * ```typescript
 * // Redshift connection
 * const redshiftConnection = {
 *   glueConnectionName: 'my-redshift-glue-conn',
 *   props: {
 *     redshiftProperties: {
 *       status: 'FAILED',
 *       errorMessage: 'Connection timeout'
 *     }
 *   }
 * }
 * const result = getGluePropertiesKey(redshiftConnection)
 * // Returns: { status: 'FAILED', errorMessage: 'Connection timeout' }
 */
export function getGluePropertiesKey(connection: DataZoneConnection) {
    if (!connection?.props) {
        return undefined
    }
    if (!connection.glueConnectionName) {
        return undefined
    }
    // Check for other properties that might contain glue connection info
    const propertiesKey = Object.keys(connection.props).find(
        (key) =>
            key.endsWith('Properties') &&
            typeof connection.props![key] === 'object' &&
            !Array.isArray(connection.props![key])
    )

    return propertiesKey ? connection.props[propertiesKey] : undefined
}

/**
 * This function handles the refactor where connections moved from a single `glueProperties` object to
 * connector-specific property bags (like `snowflakeProperties`, `redshiftProperties`, `athenaProperties`).
 * It first checks for the legacy `glueProperties` field, then falls back to connector-specific properties.
 *
 * @param connection - The DataZone connection object to extract properties from
 * @returns Object with optional status and errorMessage fields, or undefined if no properties found
 */
export function getGlueProperties(connection?: DataZoneConnection) {
    if (!connection?.props) {
        return undefined
    }
    // Check for direct glueProperties
    if ('glueProperties' in connection.props) {
        return connection.props.glueProperties
    }

    return connection?.props?.[getGluePropertiesKey(connection)!] as
        | { status?: ConnectionStatus; errorMessage?: string }
        | undefined
}

/**
 * Determines if a connection is a federated connection by checking its type.
 * A connection is considered federated if it's either:
 * 1. A Redshift connection with Glue properties, or
 * 2. A connection type that exists in GlueConnectionType
 *
 * @param connection
 * @returns - boolean
 */
export function isFederatedConnection(connection?: DataZoneConnection): boolean {
    if (connection?.type === ConnectionType.REDSHIFT) {
        return !!getGlueProperties(connection)
    }

    // Check if connection type exists in GlueConnectionType enum values
    return glueConnectionTypes.includes(connection?.type || '')
}

/**
 * Creates a DataZoneClient with appropriate credentials provider based on domain mode
 * If domain mode is express mode, use the credential profile credential provider
 * If domain mode is not express mode, use the DER credential provider
 * @param smusAuthProvider The SMUS authentication provider
 * @returns Promise resolving to DataZoneClient instance
 */
export async function createDZClientBaseOnDomainMode(
    smusAuthProvider: SmusAuthenticationProvider
): Promise<DataZoneClient> {
    let credentialsProvider
    if (getContext('aws.smus.isExpressMode') && !getContext('aws.smus.inSmusSpaceEnvironment')) {
        credentialsProvider = await smusAuthProvider.getCredentialsProviderForIamProfile(
            (smusAuthProvider.activeConnection as SmusIamConnection).profileName
        )
    } else {
        credentialsProvider = await smusAuthProvider.getDerCredentialsProvider()
    }
    return DataZoneClient.createWithCredentials(
        smusAuthProvider.getDomainRegion(),
        smusAuthProvider.getDomainId(),
        credentialsProvider
    )
}

/**
 * Creates a DataZoneClient with appropriate credentials provider for a specific project
 * If domain mode is express mode, use the project credential provider
 * If domain mode is not express mode, use the DER credential provider
 * @param smusAuthProvider The SMUS authentication provider
 * @param projectId The project ID for project-specific credentials
 * @returns Promise resolving to DataZoneClient instance
 */
export async function createDZClientForProject(
    smusAuthProvider: SmusAuthenticationProvider,
    projectId: string
): Promise<DataZoneClient> {
    const credentialsProvider = getContext('aws.smus.isExpressMode')
        ? await smusAuthProvider.getProjectCredentialProvider(projectId)
        : await smusAuthProvider.getDerCredentialsProvider()

    return DataZoneClient.createWithCredentials(
        smusAuthProvider.getDomainRegion(),
        smusAuthProvider.getDomainId(),
        credentialsProvider
    )
}
