/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'
import { getLogger } from '../../../shared/logger/logger'
import { DataZoneConnection } from '../../shared/client/datazoneClient'
import { S3Client } from '../../shared/client/s3Client'
import { NODE_ID_DELIMITER, NodeType, ConnectionType, NodePath, NodeData } from './types'
import { getLabel, isLeafNode, getIconForNodeType, getTooltip } from './utils'
import { AwsCredentialIdentity } from '@aws-sdk/types/dist-types/identity/AwsCredentialIdentity'

/**
 * S3 data node for SageMaker Unified Studio
 */
export class S3Node implements TreeNode {
    private readonly logger = getLogger()
    private childrenNodes: TreeNode[] | undefined
    private isLoading = false

    public readonly data: NodeData

    constructor(
        nodeId: string,
        nodeType: NodeType,
        label: string,
        connectionType?: ConnectionType,
        value?: any,
        path?: NodePath,
        parent?: S3Node,
        isContainer?: boolean,
        private readonly childrenProvider?: (node: S3Node) => Promise<S3Node[]>
    ) {
        this.data = {
            id: nodeId,
            nodeType,
            connectionType,
            value,
            path,
            parent,
            isContainer,
        }
    }

    public get id(): string {
        return this.data.id
    }

    public get resource(): any {
        return this.data.value || {}
    }

    /**
     * Creates a tree node from node data
     */
    public static fromNodeData(
        nodeId: string,
        nodeType: NodeType,
        label: string,
        connectionType?: ConnectionType,
        value?: any,
        path?: NodePath,
        children?: S3Node[],
        parent?: S3Node,
        isContainer?: boolean,
        childrenProvider?: (node: S3Node) => Promise<S3Node[]>
    ): S3Node {
        const node = new S3Node(
            nodeId,
            nodeType,
            label,
            connectionType,
            value,
            path,
            parent,
            isContainer,
            childrenProvider
        )

        if (children) {
            node.childrenNodes = children
        }

        return node
    }

    /**
     * Creates an error node
     */
    public static createErrorNode(nodeId: string, error: Error, parent?: S3Node): S3Node {
        return new S3Node(nodeId, NodeType.ERROR, `Error: ${error.message}`, undefined, error, undefined, parent, false)
    }

    /**
     * Creates a loading node
     */
    public static createLoadingNode(nodeId: string, parent?: S3Node): S3Node {
        return new S3Node(nodeId, NodeType.LOADING, 'Loading...', undefined, undefined, undefined, parent, false)
    }

    /**
     * Creates an empty node
     */
    public static createEmptyNode(nodeId: string, message: string, parent?: S3Node): S3Node {
        return new S3Node(nodeId, NodeType.EMPTY, message, undefined, undefined, undefined, parent, false)
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

                return [S3Node.createErrorNode(`${this.id}${NODE_ID_DELIMITER}error`, err as Error, this)]
            }
        }

        return []
    }

    public async getTreeItem(): Promise<vscode.TreeItem> {
        const collapsibleState = isLeafNode(this.data)
            ? vscode.TreeItemCollapsibleState.None
            : vscode.TreeItemCollapsibleState.Collapsed

        const label = getLabel(this.data)
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
 * Creates an S3 connection node
 */
export function createS3ConnectionNode(
    connection: DataZoneConnection,
    credentials: AwsCredentialIdentity,
    region: string
): S3Node {
    const logger = getLogger()

    // Parse S3 URI from connection
    const s3Info = parseS3Uri(connection)
    if (!s3Info) {
        logger.warn(`No S3 URI found in connection properties for connection ${connection.name}`)
        return S3Node.createErrorNode(
            `s3-connection-${connection.connectionId}-error`,
            new Error('No S3 URI configured')
        )
    }

    // Create S3 client
    const s3Client = new S3Client(region, credentials)

    // Create the connection node
    return S3Node.fromNodeData(
        `s3-connection-${connection.connectionId}`,
        NodeType.CONNECTION,
        connection.name,
        ConnectionType.S3,
        connection,
        {
            connection: connection.name,
            bucket: s3Info.bucket,
        },
        undefined,
        undefined,
        false,
        async (node) => {
            try {
                // Return a bucket node as the child of the connection
                return [
                    S3Node.fromNodeData(
                        `s3-bucket-${s3Info.bucket}`,
                        NodeType.S3_BUCKET,
                        s3Info.bucket,
                        ConnectionType.S3,
                        { bucket: s3Info.bucket },
                        {
                            connection: connection.name,
                            bucket: s3Info.bucket,
                        },
                        undefined,
                        node,
                        false,
                        async (bucketNode) => {
                            try {
                                // List objects in the bucket
                                const paths = await s3Client.listPaths(s3Info.bucket, s3Info.prefix)

                                if (paths.length === 0) {
                                    return [
                                        S3Node.createEmptyNode(
                                            `s3-bucket-${s3Info.bucket}-empty`,
                                            'No objects found',
                                            bucketNode
                                        ),
                                    ]
                                }

                                // Convert paths to nodes
                                return paths.map((path) => {
                                    const nodeId = `s3-${path.isFolder ? 'folder' : 'file'}-${path.bucket}-${path.prefix || 'root'}`

                                    return S3Node.fromNodeData(
                                        nodeId,
                                        path.isFolder ? NodeType.S3_FOLDER : NodeType.S3_FILE,
                                        path.displayName,
                                        ConnectionType.S3,
                                        path,
                                        {
                                            connection: connection.name,
                                            bucket: path.bucket,
                                            key: path.prefix,
                                            label: path.displayName,
                                        },
                                        undefined,
                                        bucketNode,
                                        false,
                                        path.isFolder ? createFolderChildrenProvider(s3Client, path) : undefined
                                    )
                                })
                            } catch (err) {
                                logger.error(`Failed to list bucket contents: ${(err as Error).message}`)
                                return [
                                    S3Node.createErrorNode(
                                        `s3-bucket-${s3Info.bucket}-error`,
                                        err as Error,
                                        bucketNode
                                    ),
                                ]
                            }
                        }
                    ),
                ]
            } catch (err) {
                logger.error(`Failed to create bucket node: ${(err as Error).message}`)
                return [S3Node.createErrorNode(`s3-connection-${connection.connectionId}-error`, err as Error, node)]
            }
        }
    )
}

/**
 * Creates a children provider function for a folder node
 */
function createFolderChildrenProvider(s3Client: S3Client, folderPath: any): (node: S3Node) => Promise<S3Node[]> {
    const logger = getLogger()

    return async (node: S3Node) => {
        try {
            // List objects in the folder
            const paths = await s3Client.listPaths(folderPath.bucket, folderPath.prefix)

            if (paths.length === 0) {
                return [S3Node.createEmptyNode(`${node.id}${NODE_ID_DELIMITER}empty`, 'No objects found', node)]
            }

            // Convert paths to nodes
            return paths.map((path) => {
                const nodeId = `s3-${path.isFolder ? 'folder' : 'file'}-${path.bucket}-${path.prefix || 'root'}`

                return S3Node.fromNodeData(
                    nodeId,
                    path.isFolder ? NodeType.S3_FOLDER : NodeType.S3_FILE,
                    path.displayName,
                    ConnectionType.S3,
                    path,
                    {
                        connection: node.data.path?.connection,
                        bucket: path.bucket,
                        key: path.prefix,
                        label: path.displayName,
                    },
                    undefined,
                    node,
                    false,
                    path.isFolder ? createFolderChildrenProvider(s3Client, path) : undefined
                )
            })
        } catch (err) {
            logger.error(`Failed to list folder contents: ${(err as Error).message}`)
            return [S3Node.createErrorNode(`${node.id}${NODE_ID_DELIMITER}error`, err as Error, node)]
        }
    }
}

/**
 * Parse S3 URI from connection
 */
function parseS3Uri(connection: DataZoneConnection): { bucket: string; prefix?: string } | undefined {
    const s3Properties = connection.props?.s3Properties
    const s3Uri = s3Properties?.s3Uri

    if (!s3Uri) {
        return undefined
    }

    // Parse S3 URI: s3://bucket-name/prefix/path/
    const match = s3Uri.match(/^s3:\/\/([^/]+)\/(.*?)\/?$/)
    if (!match) {
        return undefined
    }

    const bucket = match[1]
    const prefix = match[2] || undefined

    return { bucket, prefix }
}
