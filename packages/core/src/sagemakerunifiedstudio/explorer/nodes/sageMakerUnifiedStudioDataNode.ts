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
import { isFederatedConnection, createErrorItem } from './utils'
import { createPlaceholderItem } from '../../../shared/treeview/utils'
import {
    ConnectionType,
    DATA_DEFAULT_S3_CONNECTION_NAME_REGEXP,
    NO_DATA_FOUND_MESSAGE,
    S3_PROJECT_NON_GIT_PROJECT_REPOSITORY_LOCATION_NAME_REGEXP,
} from './types'
import { SmusAuthenticationProvider } from '../../auth/providers/smusAuthenticationProvider'
import { createFederatedConnectionNode } from './federatedConnectionStrategy'
import { createDZClientForProject } from './utils'
import { getContext } from '../../../shared/vscode/setContext'

/**
 * Tree node representing a Data folder that contains S3 and Redshift connections
 */
export class SageMakerUnifiedStudioDataNode implements TreeNode {
    public readonly id = 'smusDataExplorer'
    public readonly resource = {}
    private readonly logger = getLogger()
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
            void vscode.window.showErrorMessage(errorMessage)
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

        // Add Redshift nodes second
        if (!getContext('aws.smus.isExpressMode')) {
            for (const connection of redshiftConnections) {
                if (connection.name.startsWith('project.lakehouse')) {
                    continue
                }
                if (isFederatedConnection(connection)) {
                    continue
                }
                const node = await this.createRedshiftNode(project, connection, region)
                dataNodes.push(node)
            }
        } else {
            const federatedConnections = connections.filter((conn) => isFederatedConnection(conn))
            if (federatedConnections.length > 0) {
                const connectionsNode = this.createConnectionsParentNode(project, federatedConnections, region)
                dataNodes.push(connectionsNode)
            }
        }

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

            const accessGrantNodes = await createS3AccessGrantNodes(
                connection,
                connectionCredentialsProvider,
                connection.location?.awsRegion || region,
                connection.location?.awsAccountId
            )

            return [s3ConnectionNode, ...accessGrantNodes]
        } catch (connErr) {
            const errorMessage = `Failed to get S3 connection - ${(connErr as Error).message}`
            this.logger.error(`Failed to get S3 connection details: ${(connErr as Error).message}`)
            void vscode.window.showErrorMessage(errorMessage)
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
            void vscode.window.showErrorMessage(errorMessage)
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
            void vscode.window.showErrorMessage(errorMessage)
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
                return item
            },
            getChildren: async () => {
                // Filter connections inside the bucket parent node
                const defaultS3Connection = s3Connections.find((conn) =>
                    DATA_DEFAULT_S3_CONNECTION_NAME_REGEXP.test(conn.name)
                )
                const otherS3Connections = s3Connections.filter(
                    (conn) =>
                        !DATA_DEFAULT_S3_CONNECTION_NAME_REGEXP.test(conn.name) &&
                        !S3_PROJECT_NON_GIT_PROJECT_REPOSITORY_LOCATION_NAME_REGEXP.test(conn.name)
                )

                const s3Nodes: TreeNode[] = []

                // Add default connections first
                if (defaultS3Connection) {
                    const defaultS3Node = await this.createS3Node(project, defaultS3Connection, region)
                    s3Nodes.push(...defaultS3Node)
                }

                // Add other connections
                for (const connection of otherS3Connections) {
                    const nodes = await this.createS3Node(project, connection, region)
                    s3Nodes.push(...nodes)
                }
                return s3Nodes
            },
            getParent: () => this,
        }
    }

    private createConnectionsParentNode(
        project: DataZoneProject,
        federatedConnections: DataZoneConnection[],
        region: string
    ): TreeNode {
        return {
            id: 'connections-parent',
            resource: {},
            getTreeItem: () => {
                const item = new vscode.TreeItem('Connections', vscode.TreeItemCollapsibleState.Collapsed)
                item.contextValue = 'connectionsFolder'
                return item
            },
            getChildren: async () => {
                const nodes: TreeNode[] = []
                for (const connection of federatedConnections) {
                    try {
                        const connectionCredentialsProvider = await this.authProvider.getConnectionCredentialsProvider(
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
                    } catch (err) {
                        const errorMessage = `Failed to create federated connection - ${(err as Error).message}`
                        this.logger.error(
                            `Failed to create federated connection ${connection.name}: ${(err as Error).message}`
                        )
                        nodes.push(createErrorItem(errorMessage, `federated-${connection.connectionId}`, this.id))
                    }
                }
                return nodes
            },
            getParent: () => this,
        }
    }
}
