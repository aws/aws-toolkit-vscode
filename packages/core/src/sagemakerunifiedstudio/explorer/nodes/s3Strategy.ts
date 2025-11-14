/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'
import { getLogger } from '../../../shared/logger/logger'
import { DataZoneConnection } from '../../shared/client/datazoneClient'
import { S3Client } from '../../shared/client/s3Client'
import { ConnectionClientStore } from '../../shared/client/connectionClientStore'
import { NODE_ID_DELIMITER, NodeType, ConnectionType, NodeData, NO_DATA_FOUND_MESSAGE } from './types'
import { getLabel, isLeafNode, getIconForNodeType, getTooltip, createErrorItem } from './utils'
import { createPlaceholderItem } from '../../../shared/treeview/utils'
import {
    ListCallerAccessGrantsCommand,
    GetDataAccessCommand,
    ListCallerAccessGrantsEntry,
} from '@aws-sdk/client-s3-control'
import { S3, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { handleCredExpiredError } from '../../shared/credentialExpiryHandler'
import { ConnectionCredentialsProvider } from '../../auth/providers/connectionCredentialsProvider'
import { telemetry } from '../../../shared/telemetry/telemetry'
import { recordDataConnectionTelemetry } from '../../shared/telemetry'

// Regex to match default S3 connection names
// eslint-disable-next-line @typescript-eslint/naming-convention
export const DATA_DEFAULT_S3_CONNECTION_NAME_REGEXP = /^(project\.s3_default_folder)|(default\.s3)$/

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

                const errorMessage = (err as Error).message
                await handleCredExpiredError(err, true)
                return [createErrorItem(errorMessage, 'getChildren', this.id) as S3Node]
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
    connectionCredentialsProvider: ConnectionCredentialsProvider,
    region: string
): S3Node {
    const logger = getLogger()

    // Parse S3 URI from connection
    const s3Info = parseS3Uri(connection)
    if (!s3Info) {
        logger.warn(`No S3 URI found in connection properties for connection ${connection.name}`)
        const errorMessage = 'No S3 URI configured'
        void vscode.window.showErrorMessage(errorMessage)
        return createErrorItem(errorMessage, 'connection', connection.connectionId) as S3Node
    }

    // Handle case where s3Uri is "s3://" (all buckets access)
    const isAllBucketsAccess = !s3Info.bucket

    // Get S3 client from store
    const clientStore = ConnectionClientStore.getInstance()
    const s3Client = clientStore.getS3Client(connection.connectionId, region, connectionCredentialsProvider)

    // Check if this is a default S3 connection
    const isDefaultConnection = DATA_DEFAULT_S3_CONNECTION_NAME_REGEXP.test(connection.name)

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
            return telemetry.smus_renderS3Node.run(async (span) => {
                await recordDataConnectionTelemetry(span, connection, connectionCredentialsProvider)
                try {
                    if (isAllBucketsAccess) {
                        // For all buckets access (s3://), list all accessible buckets
                        try {
                            const buckets = await s3Client.listBuckets()
                            if (buckets.length === 0) {
                                return [createPlaceholderItem(NO_DATA_FOUND_MESSAGE) as S3Node]
                            }

                            return buckets.map((bucket) => {
                                return new S3Node(
                                    {
                                        id: bucket.Name || 'unknown-bucket',
                                        nodeType: NodeType.S3_BUCKET,
                                        connectionType: ConnectionType.S3,
                                        value: { bucket: bucket.Name },
                                        path: {
                                            connection: connection.name,
                                            bucket: bucket.Name,
                                        },
                                        parent: node,
                                    },
                                    async (bucketNode) => {
                                        try {
                                            const allPaths = []
                                            let nextToken: string | undefined

                                            do {
                                                const result = await s3Client.listPaths(
                                                    bucket.Name || '',
                                                    undefined,
                                                    nextToken
                                                )
                                                allPaths.push(...result.paths)
                                                nextToken = result.nextToken
                                            } while (nextToken)

                                            if (allPaths.length === 0) {
                                                return [createPlaceholderItem(NO_DATA_FOUND_MESSAGE) as S3Node]
                                            }

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
                                                    path.isFolder
                                                        ? createFolderChildrenProvider(s3Client, path)
                                                        : undefined
                                                )
                                            })
                                        } catch (err) {
                                            logger.error(`Failed to list bucket contents: ${(err as Error).message}`)
                                            const errorMessage = (err as Error).message
                                            await handleCredExpiredError(err, true)
                                            return [
                                                createErrorItem(
                                                    errorMessage,
                                                    'bucket-contents-all-access',
                                                    bucketNode.id
                                                ) as S3Node,
                                            ]
                                        }
                                    }
                                )
                            })
                        } catch (err) {
                            logger.error(`Failed to list buckets: ${(err as Error).message}`)
                            const errorMessage = (err as Error).message
                            await handleCredExpiredError(err, true)
                            return [createErrorItem(errorMessage, 'list-buckets', node.id) as S3Node]
                        }
                    } else if (isDefaultConnection && s3Info.prefix) {
                        // For default connections, show the full path as the first node
                        const fullPath = `${s3Info.bucket}/${s3Info.prefix}`
                        return [
                            new S3Node(
                                {
                                    id: fullPath,
                                    nodeType: NodeType.S3_BUCKET,
                                    connectionType: ConnectionType.S3,
                                    value: { bucket: s3Info.bucket, prefix: s3Info.prefix },
                                    path: {
                                        connection: connection.name,
                                        bucket: s3Info.bucket,
                                        key: s3Info.prefix,
                                        label: fullPath,
                                    },
                                    parent: node,
                                },
                                async (bucketNode) => {
                                    try {
                                        // List objects starting from the prefix
                                        const allPaths = []
                                        let nextToken: string | undefined

                                        do {
                                            const result = await s3Client.listPaths(
                                                s3Info.bucket,
                                                s3Info.prefix,
                                                nextToken
                                            )
                                            allPaths.push(...result.paths)
                                            nextToken = result.nextToken
                                        } while (nextToken)

                                        if (allPaths.length === 0) {
                                            return [createPlaceholderItem(NO_DATA_FOUND_MESSAGE) as S3Node]
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
                                        const errorMessage = (err as Error).message
                                        await handleCredExpiredError(err, true)
                                        return [
                                            createErrorItem(
                                                errorMessage,
                                                'bucket-contents-default',
                                                bucketNode.id
                                            ) as S3Node,
                                        ]
                                    }
                                }
                            ),
                        ]
                    } else {
                        // For non-default connections, show bucket as the first node
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
                                            const result = await s3Client.listPaths(
                                                s3Info.bucket,
                                                s3Info.prefix,
                                                nextToken
                                            )
                                            allPaths.push(...result.paths)
                                            nextToken = result.nextToken
                                        } while (nextToken)

                                        if (allPaths.length === 0) {
                                            return [createPlaceholderItem(NO_DATA_FOUND_MESSAGE) as S3Node]
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
                                        const errorMessage = (err as Error).message
                                        await handleCredExpiredError(err, true)
                                        return [
                                            createErrorItem(
                                                errorMessage,
                                                'bucket-contents-regular',
                                                bucketNode.id
                                            ) as S3Node,
                                        ]
                                    }
                                }
                            ),
                        ]
                    }
                } catch (err) {
                    logger.error(`Failed to create bucket node: ${(err as Error).message}`)
                    const errorMessage = (err as Error).message
                    await handleCredExpiredError(err, true)
                    return [createErrorItem(errorMessage, 'bucket-node', node.id) as S3Node]
                }
            })
        }
    )
}

/**
 * Creates S3 access grant nodes for project.s3_default_folder connections
 */
export async function createS3AccessGrantNodes(
    connection: DataZoneConnection,
    connectionCredentialsProvider: ConnectionCredentialsProvider,
    region: string,
    accountId: string | undefined
): Promise<S3Node[]> {
    if (connection.name !== 'project.s3_default_folder' || !accountId) {
        return []
    }

    return await listCallerAccessGrants(connectionCredentialsProvider, region, accountId, connection.connectionId)
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
                return [createPlaceholderItem(NO_DATA_FOUND_MESSAGE) as S3Node]
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
            const errorMessage = (err as Error).message
            await handleCredExpiredError(err, true)
            return [createErrorItem(errorMessage, 'folder-contents', node.id) as S3Node]
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

    // Handle case where s3Uri is just "s3://" (all buckets access)
    if (s3Uri === 's3://') {
        return { bucket: '', prefix: undefined }
    }

    // Parse S3 URI: s3://bucket-name/prefix/path/
    const uriWithoutPrefix = s3Uri.replace('s3://', '')

    // Handle empty URI after removing prefix
    if (!uriWithoutPrefix) {
        return { bucket: '', prefix: undefined }
    }

    // Since the URI ends with a slash, the last item will be an empty string, so ignore it in the parts.
    const parts = uriWithoutPrefix.split('/').slice(0, -1)
    const bucket = parts[0] || ''

    // If parts only contains 1 item, then only a bucket was provided, and the key is empty.
    const prefix = parts.length > 1 ? parts.slice(1).join('/') + '/' : undefined

    return { bucket, prefix }
}

async function listCallerAccessGrants(
    connectionCredentialsProvider: ConnectionCredentialsProvider,
    region: string,
    accountId: string,
    connectionId: string
): Promise<S3Node[]> {
    const logger = getLogger()
    try {
        const clientStore = ConnectionClientStore.getInstance()
        const s3ControlClient = clientStore.getS3ControlClient(connectionId, region, connectionCredentialsProvider)

        const allGrants: ListCallerAccessGrantsEntry[] = []
        let nextToken: string | undefined

        do {
            const command = new ListCallerAccessGrantsCommand({
                AccountId: accountId,
                NextToken: nextToken,
            })

            const response = await s3ControlClient.send(command)
            const grants = response.CallerAccessGrantsList?.filter((entry) => !!entry) ?? []
            allGrants.push(...grants)
            nextToken = response.NextToken
        } while (nextToken)

        logger.info(`Listed ${allGrants.length} caller access grants`)

        const accessGrantNodes = allGrants.map((grant) =>
            getRootNodeFromS3AccessGrant(grant, accountId, region, connectionCredentialsProvider, connectionId)
        )
        return accessGrantNodes
    } catch (error) {
        logger.error(`Failed to list caller access grants: ${(error as Error).message}`)
        await handleCredExpiredError(error)
        return []
    }
}

function parseS3UriForAccessGrant(s3Uri: string): { bucket: string; key: string } {
    const uriWithoutPrefix = s3Uri.replace('s3://', '')
    const parts = uriWithoutPrefix.split('/').slice(0, -1)
    const bucket = parts[0]
    const key = parts.length > 1 ? parts.slice(1).join('/') + '/' : ''
    return { bucket, key }
}

function getRootNodeFromS3AccessGrant(
    s3AccessGrant: ListCallerAccessGrantsEntry,
    accountId: string,
    region: string,
    connectionCredentialsProvider: ConnectionCredentialsProvider,
    connectionId: string
): S3Node {
    const s3Uri = s3AccessGrant.GrantScope
    let bucket: string | undefined
    let key: string | undefined
    let nodeId = ''
    let label: string

    if (s3Uri) {
        const { bucket: parsedBucket, key: parsedKey } = parseS3UriForAccessGrant(s3Uri)
        bucket = parsedBucket
        key = parsedKey
        label = s3Uri.replace('s3://', '').replace('*', '')
        nodeId = label
    } else {
        label = s3AccessGrant.GrantScope ?? ''
    }

    return new S3Node(
        {
            id: nodeId,
            nodeType: NodeType.S3_ACCESS_GRANT,
            connectionType: ConnectionType.S3,
            value: s3AccessGrant,
            path: { accountId, bucket, key, label },
        },
        async (node) => {
            return await fetchAccessGrantChildren(node, accountId, region, connectionCredentialsProvider, connectionId)
        }
    )
}

async function fetchAccessGrantChildren(
    node: S3Node,
    accountId: string,
    region: string,
    connectionCredentialsProvider: ConnectionCredentialsProvider,
    connectionId: string
): Promise<S3Node[]> {
    const logger = getLogger()
    const path = node.data.path

    try {
        const clientStore = ConnectionClientStore.getInstance()
        const s3ControlClient = clientStore.getS3ControlClient(connectionId, region, connectionCredentialsProvider)

        const target = `s3://${path?.bucket ?? ''}/${path?.key ?? ''}*`

        const getDataAccessCommand = new GetDataAccessCommand({
            AccountId: accountId,
            Target: target,
            Permission: 'READ',
        })

        const grantCredentialsProvider = async () => {
            const response = await s3ControlClient.send(getDataAccessCommand)
            if (
                !response.Credentials?.AccessKeyId ||
                !response.Credentials?.SecretAccessKey ||
                !response.Credentials?.SessionToken
            ) {
                throw new Error('Missing required credentials from access grant response')
            }
            return {
                accessKeyId: response.Credentials.AccessKeyId,
                secretAccessKey: response.Credentials.SecretAccessKey,
                sessionToken: response.Credentials.SessionToken,
                expiration: response.Credentials.Expiration,
            }
        }

        const s3ClientWithGrant = new S3({
            credentials: grantCredentialsProvider,
            region,
        })

        const response = await s3ClientWithGrant.send(
            new ListObjectsV2Command({
                Bucket: path?.bucket ?? '',
                Prefix: path?.key ?? '',
                Delimiter: '/',
                MaxKeys: 100,
            })
        )

        const children: S3Node[] = []

        // Add folders
        if (response.CommonPrefixes) {
            for (const prefix of response.CommonPrefixes) {
                const folderName =
                    prefix.Prefix?.split('/')
                        .filter((name) => !!name)
                        .at(-1) + '/'
                children.push(
                    new S3Node(
                        {
                            id: `${node.id}${NODE_ID_DELIMITER}${folderName}`,
                            nodeType: NodeType.S3_FOLDER,
                            connectionType: ConnectionType.S3,
                            value: prefix,
                            path: {
                                accountId,
                                bucket: path?.bucket,
                                key: prefix.Prefix,
                                label: folderName,
                            },
                            parent: node,
                        },
                        async (folderNode) => {
                            return await fetchAccessGrantChildren(
                                folderNode,
                                accountId,
                                region,
                                connectionCredentialsProvider,
                                connectionId
                            )
                        }
                    )
                )
            }
        }

        // Add files
        if (response.Contents) {
            for (const content of response.Contents.filter((content) => content.Key !== response.Prefix)) {
                const fileName = content.Key?.split('/').at(-1) ?? ''
                children.push(
                    new S3Node({
                        id: `${node.id}${NODE_ID_DELIMITER}${fileName}`,
                        nodeType: NodeType.S3_FILE,
                        connectionType: ConnectionType.S3,
                        value: content,
                        path: {
                            bucket: path?.bucket,
                            key: content.Key,
                            label: fileName,
                        },
                        parent: node,
                    })
                )
            }
        }

        return children
    } catch (error) {
        logger.error(`Failed to fetch access grant children: ${(error as Error).message}`)
        const errorMessage = (error as Error).message
        await handleCredExpiredError(error, true)
        return [createErrorItem(errorMessage, 'access-grant-children', node.id) as S3Node]
    }
}
