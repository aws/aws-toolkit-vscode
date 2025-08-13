/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'
import { getLogger } from '../../../shared/logger/logger'
import { DataZoneConnection } from '../../shared/client/datazoneClient'
import { S3Client } from '../../shared/client/s3Client'
import { NODE_ID_DELIMITER, NodeType, ConnectionType, NodeData } from './types'
import { getLabel, isLeafNode, getIconForNodeType, getTooltip } from './utils'
import { AwsCredentialIdentity } from '@aws-sdk/types/dist-types/identity/AwsCredentialIdentity'

/**
 * S3 data node for SageMaker Unified Studio
 */
export class S3Node implements TreeNode {
    private readonly logger = getLogger()
    private childrenNodes: TreeNode[] | undefined
    private isLoading = false

    constructor(
        public readonly data: NodeData,
        private readonly childrenProvider?: (node: S3Node) => Promise<S3Node[]>
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
        return createErrorNode(`${connection.connectionId}-error`, new Error('No S3 URI configured'))
    }

    // Create S3 client
    const s3Client = new S3Client(region, credentials)

    // Create the connection node
    return new S3Node(
        {
            id: connection.connectionId,
            nodeType: NodeType.CONNECTION,
            connectionType: ConnectionType.S3,
            value: { connection },
            path: {
                connection: connection.name,
                bucket: s3Info.bucket,
            },
        },
        async (node) => {
            try {
                // Return a bucket node as the child of the connection
                return [
                    new S3Node(
                        {
                            id: s3Info.bucket,
                            nodeType: NodeType.S3_BUCKET,
                            connectionType: ConnectionType.S3,
                            value: { bucket: s3Info.bucket },
                            path: {
                                connection: connection.name,
                                bucket: s3Info.bucket,
                            },
                            parent: node,
                        },
                        async (bucketNode) => {
                            try {
                                // List objects in the bucket
                                const allPaths = []
                                let nextToken: string | undefined

                                do {
                                    const result = await s3Client.listPaths(s3Info.bucket, s3Info.prefix, nextToken)
                                    allPaths.push(...result.paths)
                                    nextToken = result.nextToken
                                } while (nextToken)

                                if (allPaths.length === 0) {
                                    return [createEmptyNode(`${s3Info.bucket}-empty`, 'No objects found', bucketNode)]
                                }

                                // Convert paths to nodes
                                return allPaths.map((path) => {
                                    const nodeId = `${path.bucket}-${path.prefix || 'root'}`

                                    return new S3Node(
                                        {
                                            id: nodeId,
                                            nodeType: path.isFolder ? NodeType.S3_FOLDER : NodeType.S3_FILE,
                                            connectionType: ConnectionType.S3,
                                            value: path,
                                            path: {
                                                connection: connection.name,
                                                bucket: path.bucket,
                                                key: path.prefix,
                                                label: path.displayName,
                                            },
                                            parent: bucketNode,
                                        },
                                        path.isFolder ? createFolderChildrenProvider(s3Client, path) : undefined
                                    )
                                })
                            } catch (err) {
                                logger.error(`Failed to list bucket contents: ${(err as Error).message}`)
                                return [createErrorNode(`${s3Info.bucket}-error`, err as Error, bucketNode)]
                            }
                        }
                    ),
                ]
            } catch (err) {
                logger.error(`Failed to create bucket node: ${(err as Error).message}`)
                return [createErrorNode(`${connection.connectionId}-error`, err as Error, node)]
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
            const allPaths = []
            let nextToken: string | undefined

            do {
                const result = await s3Client.listPaths(folderPath.bucket, folderPath.prefix, nextToken)
                allPaths.push(...result.paths)
                nextToken = result.nextToken
            } while (nextToken)

            if (allPaths.length === 0) {
                return [createEmptyNode(`${node.id}${NODE_ID_DELIMITER}empty`, 'No objects found', node)]
            }

            // Convert paths to nodes
            return allPaths.map((path) => {
                const nodeId = `${path.bucket}-${path.prefix || 'root'}`

                return new S3Node(
                    {
                        id: nodeId,
                        nodeType: path.isFolder ? NodeType.S3_FOLDER : NodeType.S3_FILE,
                        connectionType: ConnectionType.S3,
                        value: path,
                        path: {
                            connection: node.data.path?.connection,
                            bucket: path.bucket,
                            key: path.prefix,
                            label: path.displayName,
                        },
                        parent: node,
                    },
                    path.isFolder ? createFolderChildrenProvider(s3Client, path) : undefined
                )
            })
        } catch (err) {
            logger.error(`Failed to list folder contents: ${(err as Error).message}`)
            return [createErrorNode(`${node.id}${NODE_ID_DELIMITER}error`, err as Error, node)]
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

/**
 * Creates an error node
 */
function createErrorNode(id: string, error: Error, parent?: S3Node): S3Node {
    return new S3Node({
        id,
        nodeType: NodeType.ERROR,
        value: error,
        parent,
    })
}

/**
 * Creates an empty node
 */
function createEmptyNode(id: string, message: string, parent?: S3Node): S3Node {
    return new S3Node({
        id,
        nodeType: NodeType.EMPTY,
        value: message,
        parent,
    })
}
