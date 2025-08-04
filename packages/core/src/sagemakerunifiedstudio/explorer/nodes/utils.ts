/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getIcon, IconPath } from '../../../shared/icons'
import {
    NODE_ID_DELIMITER,
    NodeType,
    RedshiftServiceModelUrl,
    RedshiftType,
    ConnectionType,
    NodeData,
    LEAF_NODE_TYPES,
} from './types'

/**
 * Gets the label for a node based on its data
 */
export function getLabel(data: {
    id: string
    nodeType: NodeType
    isContainer?: boolean
    path?: { key?: string; label?: string }
}): string {
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
export function getIconForNodeType(nodeType: NodeType, isContainer?: boolean): vscode.ThemeIcon | IconPath {
    switch (nodeType) {
        case NodeType.CONNECTION:
            return getIcon('vscode-plug')
        case NodeType.S3_BUCKET:
            return getIcon('aws-s3-bucket')
        case NodeType.S3_FOLDER:
            return getIcon('vscode-folder')
        case NodeType.S3_FILE:
            return getIcon('vscode-file')
        case NodeType.REDSHIFT_CLUSTER:
            return new vscode.ThemeIcon('database')
        case NodeType.REDSHIFT_DATABASE:
        case NodeType.GLUE_DATABASE:
            return new vscode.ThemeIcon('database')
        case NodeType.REDSHIFT_SCHEMA:
            return new vscode.ThemeIcon('symbol-namespace')
        case NodeType.REDSHIFT_TABLE:
        case NodeType.GLUE_TABLE:
            return isContainer ? new vscode.ThemeIcon('list-tree') : new vscode.ThemeIcon('table')
        case NodeType.REDSHIFT_VIEW:
            return isContainer ? new vscode.ThemeIcon('list-tree') : new vscode.ThemeIcon('eye')
        case NodeType.REDSHIFT_FUNCTION:
        case NodeType.REDSHIFT_STORED_PROCEDURE:
            return isContainer ? new vscode.ThemeIcon('list-tree') : new vscode.ThemeIcon('symbol-method')
        case NodeType.GLUE_CATALOG:
            return new vscode.ThemeIcon('database')
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
 * Creates a tree item for a column node with type information
 */
export function createColumnTreeItem(label: string, columnType: string, nodeType: NodeType): vscode.TreeItem {
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None)

    // Add column type as description (secondary text)
    item.description = columnType

    // Set icon based on node type
    item.iconPath = getIconForNodeType(nodeType)

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
