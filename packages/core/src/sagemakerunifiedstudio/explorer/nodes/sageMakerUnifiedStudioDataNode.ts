/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'
import { getIcon } from '../../../shared/icons'

import { getLogger } from '../../../shared/logger/logger'
import { DataZoneConnection, DataZoneProject } from '../../shared/client/datazoneClient'
import { createS3ConnectionNode, createS3AccessGrantNodes } from './s3Strategy'
import { createRedshiftConnectionNode } from './redshiftStrategy'
import { createLakehouseConnectionNode } from './lakehouseStrategy'
import { SageMakerUnifiedStudioProjectNode } from './sageMakerUnifiedStudioProjectNode'
import { isFederatedConnection, createErrorItem, createDZClientForProject } from './utils'
import { createPlaceholderItem } from '../../../shared/treeview/utils'
import {
    ConnectionType,
    DEFAULT_S3_BUCKETS_CONNECTION,
    DEFAULT_S3_SHARED_CONNECTION,
    IDC_S3_PROJECT_FOLDER_CONNECTION,
    NO_DATA_FOUND_MESSAGE,
} from './types'
import { SmusAuthenticationProvider } from '../../auth/providers/smusAuthenticationProvider'
import { createFederatedConnectionNode } from './federatedConnectionStrategy'
import { handleCredExpiredError } from '../../shared/credentialExpiryHandler'

/**
 * Tree node representing a Data folder that contains S3 and Redshift connections
 */
export class SageMakerUnifiedStudioDataNode implements TreeNode {
    public readonly id = 'smusDataExplorer'
    public readonly resource = {}
    private readonly logger = getLogger('smus')
    private childrenNodes: TreeNode[] | undefined
    private readonly authProvider: SmusAuthenticationProvider

    constructor(
        private readonly parent: SageMakerUnifiedStudioProjectNode,
        initialChildren: TreeNode[] = []
    ) {
        this.childrenNodes = initialChildren.length > 0 ? initialChildren : undefined
        this.authProvider = SmusAuthenticationProvider.fromContext()
    }

    public getTreeItem(): vscode.TreeItem {
        const item = new vscode.TreeItem('Data', vscode.TreeItemCollapsibleState.Collapsed)
        item.iconPath = getIcon('vscode-library')
        item.contextValue = 'dataFolder'
        return item
    }

    public async getChildren(): Promise<TreeNode[]> {
        if (this.childrenNodes !== undefined) {
            return this.childrenNodes
        }

        try {
            const project = this.parent.getProject()
            if (!project) {
                const errorMessage = 'No project information available'
                this.logger.error(errorMessage)
                void vscode.window.showErrorMessage(errorMessage)
                return [createErrorItem(errorMessage, 'project', this.id)]
            }

            const datazoneClient = await createDZClientForProject(this.authProvider, project.id)

            const connections = await datazoneClient.listConnections(project.domainId, undefined, project.id)
            this.logger.info(`Found ${connections.length} connections for project ${project.id}`)

            if (connections.length === 0) {
                this.childrenNodes = [createPlaceholderItem(NO_DATA_FOUND_MESSAGE)]
                return this.childrenNodes
            }

            const dataNodes = await this.createConnectionNodes(project, connections)
            this.childrenNodes = dataNodes
            return dataNodes
        } catch (err) {
            const project = this.parent.getProject()
            const projectInfo = project ? `project: ${project.id}, domain: ${project.domainId}` : 'unknown project'
            const errorMessage = 'Failed to get connections'
            this.logger.error(`Failed to get connections for ${projectInfo}: ${(err as Error).message}`)
            await handleCredExpiredError(err, true)
            return [createErrorItem(errorMessage, 'connections', this.id)]
        }
    }

    public getParent(): TreeNode | undefined {
        return this.parent
    }

    private async createConnectionNodes(
        project: DataZoneProject,
        connections: DataZoneConnection[]
    ): Promise<TreeNode[]> {
        const region = this.authProvider.getDomainRegion()
        const dataNodes: TreeNode[] = []

        const s3Connections = connections.filter((conn) => (conn.type as ConnectionType) === ConnectionType.S3)
        const redshiftConnections = connections.filter(
            (conn) => (conn.type as ConnectionType) === ConnectionType.REDSHIFT
        )
        const lakehouseConnections = connections.filter(
            (conn) => (conn.type as ConnectionType) === ConnectionType.LAKEHOUSE
        )

        // Add Lakehouse nodes first
        for (const connection of lakehouseConnections) {
            const node = await this.createLakehouseNode(project, connection, region)
            dataNodes.push(node)
        }

        // Add Redshift nodes under Connections parent node
        const filteredRedshiftConnections = redshiftConnections.filter(
            (conn) => !conn.name.startsWith('project.lakehouse') && !isFederatedConnection(conn)
        )
        const federatedConnections = connections.filter((conn) => isFederatedConnection(conn))
        const allConnectionsForParent = [...filteredRedshiftConnections, ...federatedConnections]

        // Always show Connections node, it will display "No data" if empty
        const connectionsNode = this.createConnectionsParentNode(project, allConnectionsForParent, region)
        dataNodes.push(connectionsNode)

        // Add S3 Bucket parent node last
        if (s3Connections.length > 0) {
            const bucketNode = this.createBucketParentNode(project, s3Connections, region)
            dataNodes.push(bucketNode)
        }

        this.logger.info(`Created ${dataNodes.length} total connection nodes`)
        return dataNodes
    }

    private async createS3Node(
        project: DataZoneProject,
        connection: DataZoneConnection,
        region: string
    ): Promise<TreeNode[]> {
        try {
            const connectionCredentialsProvider = await this.authProvider.getConnectionCredentialsProvider(
                connection.connectionId,
                project.id,
                connection.location?.awsRegion || region
            )

            const s3ConnectionNode = createS3ConnectionNode(
                connection,
                connectionCredentialsProvider,
                connection.location?.awsRegion || region
            )

            // Get the bucket children directly (skip the S3 wrapper node)
            const bucketChildren = await s3ConnectionNode.getChildren()

            const accessGrantNodes = await createS3AccessGrantNodes(
                connection,
                connectionCredentialsProvider,
                connection.location?.awsRegion || region,
                connection.location?.awsAccountId
            )

            return [...bucketChildren, ...accessGrantNodes]
        } catch (connErr) {
            const errorMessage = `Failed to get S3 connection - ${(connErr as Error).message}`
            this.logger.error(`Failed to get S3 connection details: ${(connErr as Error).message}`)
            await handleCredExpiredError(connErr, true)
            return [createErrorItem(errorMessage, `s3-${connection.connectionId}`, this.id)]
        }
    }

    private async createRedshiftNode(
        project: DataZoneProject,
        connection: DataZoneConnection,
        region: string
    ): Promise<TreeNode> {
        try {
            const datazoneClient = await createDZClientForProject(this.authProvider, project.id)
            const getConnectionResponse = await datazoneClient.getConnection({
                domainIdentifier: project.domainId,
                identifier: connection.connectionId,
                withSecret: true,
            })

            const connectionCredentialsProvider = await this.authProvider.getConnectionCredentialsProvider(
                connection.connectionId,
                project.id,
                getConnectionResponse.location?.awsRegion || region
            )

            return createRedshiftConnectionNode(connection, connectionCredentialsProvider)
        } catch (connErr) {
            const errorMessage = `Failed to get Redshift connection - ${(connErr as Error).message}`
            this.logger.error(`Failed to get Redshift connection details: ${(connErr as Error).message}`)
            await handleCredExpiredError(connErr, true)
            return createErrorItem(errorMessage, `redshift-${connection.connectionId}`, this.id)
        }
    }

    private async createLakehouseNode(
        project: DataZoneProject,
        connection: DataZoneConnection,
        region: string
    ): Promise<TreeNode> {
        try {
            const connectionCredentialsProvider = await this.authProvider.getConnectionCredentialsProvider(
                connection.connectionId,
                project.id,
                connection.location?.awsRegion || region
            )

            return createLakehouseConnectionNode(connection, connectionCredentialsProvider, region)
        } catch (connErr) {
            const errorMessage = `Failed to get Lakehouse connection - ${(connErr as Error).message}`
            this.logger.error(`Failed to get Lakehouse connection details: ${(connErr as Error).message}`)
            await handleCredExpiredError(connErr, true)
            return createErrorItem(errorMessage, `lakehouse-${connection.connectionId}`, this.id)
        }
    }

    private createBucketParentNode(
        project: DataZoneProject,
        s3Connections: DataZoneConnection[],
        region: string
    ): TreeNode {
        return {
            id: 'bucket-parent',
            resource: {},
            getTreeItem: () => {
                const item = new vscode.TreeItem('Buckets', vscode.TreeItemCollapsibleState.Collapsed)
                item.contextValue = 'bucketFolder'
                item.iconPath = getIcon('aws-s3-bucket')
                return item
            },
            getChildren: async () => {
                // Find S3 connections by name (matching MaxDomeFileExplorer logic)
                // https://code.amazon.com/packages/MaxDomeFileExplorer/blobs/heads/mainline/--/src/hooks/useGetInitialNodes.ts
                const sharedConnection = s3Connections.find((conn) => conn.name === DEFAULT_S3_SHARED_CONNECTION)
                const defaultConnection = s3Connections.find((conn) => conn.name === DEFAULT_S3_BUCKETS_CONNECTION)
                const idcProjectFolderConnection = s3Connections.find(
                    (conn) => conn.name === IDC_S3_PROJECT_FOLDER_CONNECTION
                )

                // Determine domain type: IAM domains have 'default.s3' connection
                const isIamDomain = !!defaultConnection

                // Project bucket: For IAM domains use 'default.s3_shared', for IDC domains use 'project.s3_default_folder'
                const projectBucketConnection = isIamDomain ? sharedConnection : idcProjectFolderConnection

                // Other Buckets: For IAM domains, use 'default.s3' connection (which lists all buckets)
                // Plus any additional S3 connections that are not the known ones
                const knownConnectionNames = new Set([
                    DEFAULT_S3_BUCKETS_CONNECTION,
                    DEFAULT_S3_SHARED_CONNECTION,
                    IDC_S3_PROJECT_FOLDER_CONNECTION,
                ])
                const additionalConnections = s3Connections.filter((conn) => !knownConnectionNames.has(conn.name))

                const bucketNodes: TreeNode[] = []

                // Add "Project bucket" node if project bucket connection exists
                if (projectBucketConnection) {
                    const projectBucketNode = this.createProjectBucketNode(project, projectBucketConnection, region)
                    bucketNodes.push(projectBucketNode)
                }

                // Add "Other Buckets" node only if default.s3 connection exists (IAM domains only)
                if (defaultConnection) {
                    const otherBucketsNode = this.createOtherBucketsNode(project, defaultConnection, region)
                    bucketNodes.push(otherBucketsNode)
                }

                // Add additional connections as separate root nodes (not inside "Other Buckets")
                for (const connection of additionalConnections) {
                    const connectionNodes = await this.createS3Node(project, connection, region)
                    bucketNodes.push(...connectionNodes)
                }

                if (bucketNodes.length === 0) {
                    return [createPlaceholderItem(NO_DATA_FOUND_MESSAGE)]
                }
                return bucketNodes
            },
            getParent: () => this,
        }
    }

    private createProjectBucketNode(
        project: DataZoneProject,
        defaultS3Connection: DataZoneConnection,
        region: string
    ): TreeNode {
        return {
            id: 'project-bucket',
            resource: {},
            getTreeItem: () => {
                const item = new vscode.TreeItem('Project bucket', vscode.TreeItemCollapsibleState.Collapsed)
                item.contextValue = 'projectBucketFolder'
                item.iconPath = getIcon('aws-s3-bucket')
                return item
            },
            getChildren: async () => {
                const nodes = await this.createS3Node(project, defaultS3Connection, region)
                if (nodes.length === 0) {
                    return [createPlaceholderItem(NO_DATA_FOUND_MESSAGE)]
                }
                return nodes
            },
            getParent: () => this,
        }
    }

    /**
     * Creates the "Other buckets" node for IAM domains.
     * Uses default.s3 connection to list all buckets.
     */
    private createOtherBucketsNode(
        project: DataZoneProject,
        defaultS3Connection: DataZoneConnection,
        region: string
    ): TreeNode {
        return {
            id: 'other-buckets',
            resource: {},
            getTreeItem: () => {
                const item = new vscode.TreeItem('Other buckets', vscode.TreeItemCollapsibleState.Collapsed)
                item.contextValue = 'otherBucketsFolder'
                item.iconPath = getIcon('aws-s3-bucket')
                return item
            },
            getChildren: async () => {
                const s3Nodes = await this.createS3Node(project, defaultS3Connection, region)
                if (s3Nodes.length === 0) {
                    return [createPlaceholderItem(NO_DATA_FOUND_MESSAGE)]
                }
                return s3Nodes
            },
            getParent: () => this,
        }
    }

    private createConnectionsParentNode(
        project: DataZoneProject,
        allConnections: DataZoneConnection[],
        region: string
    ): TreeNode {
        return {
            id: 'connections-parent',
            resource: {},
            getTreeItem: () => {
                const item = new vscode.TreeItem('Connections', vscode.TreeItemCollapsibleState.Collapsed)
                item.contextValue = 'connectionsFolder'
                item.iconPath = getIcon('aws-sagemakerunifiedstudio-route-filled')
                return item
            },
            getChildren: async () => {
                const nodes: TreeNode[] = []
                for (const connection of allConnections) {
                    try {
                        if (isFederatedConnection(connection)) {
                            const connectionCredentialsProvider =
                                await this.authProvider.getConnectionCredentialsProvider(
                                    connection.connectionId,
                                    project.id,
                                    connection.location?.awsRegion || region
                                )
                            const node = await createFederatedConnectionNode(
                                connection,
                                connectionCredentialsProvider,
                                region
                            )
                            nodes.push(node)
                        } else {
                            const node = await this.createRedshiftNode(project, connection, region)
                            nodes.push(node)
                        }
                    } catch (err) {
                        const errorMessage = `Failed to create connection - ${(err as Error).message}`
                        this.logger.error(`Failed to create connection ${connection.name}: ${(err as Error).message}`)
                        nodes.push(createErrorItem(errorMessage, `connection-${connection.connectionId}`, this.id))
                        await handleCredExpiredError(err)
                    }
                }
                if (nodes.length === 0) {
                    return [createPlaceholderItem(NO_DATA_FOUND_MESSAGE)]
                }
                return nodes
            },
            getParent: () => this,
        }
    }
}
