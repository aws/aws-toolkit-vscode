/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'
import { getIcon } from '../../../shared/icons'

import { getLogger } from '../../../shared/logger/logger'
import { DataZoneClient, DataZoneConnection, DataZoneProject } from '../../shared/client/datazoneClient'
import { createS3ConnectionNode, createS3AccessGrantNodes } from './s3Strategy'
import { createRedshiftConnectionNode } from './redshiftStrategy'
import { createLakehouseConnectionNode } from './lakehouseStrategy'
import { SageMakerUnifiedStudioProjectNode } from './sageMakerUnifiedStudioProjectNode'
import { createErrorTreeItem, isFederatedConnection } from './utils'
import { ConnectionType } from './types'
import { SmusAuthenticationProvider } from '../../auth/providers/smusAuthenticationProvider'

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
                this.logger.error('No project information available')
                return [this.createErrorNode('No project information available')]
            }

            const datazoneClient = await DataZoneClient.getInstance(this.authProvider)
            const connections = await datazoneClient.listConnections(project.domainId, undefined, project.id)
            this.logger.info(`Found ${connections.length} connections for project ${project.id}`)

            if (connections.length === 0) {
                this.childrenNodes = []
                return []
            }

            const dataNodes = await this.createConnectionNodes(project, connections)
            this.childrenNodes = dataNodes
            return dataNodes
        } catch (err) {
            const project = this.parent.getProject()
            const projectInfo = project ? `project: ${project.id}, domain: ${project.domainId}` : 'unknown project'
            this.logger.error(`Failed to get connections for ${projectInfo}: ${(err as Error).message}`)
            return [this.createErrorNode(`Failed to get connections: ${(err as Error).message}`)]
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

        // Create Bucket parent node if there are S3 connections
        if (s3Connections.length > 0) {
            const bucketNode = this.createBucketParentNode(project, s3Connections, region)
            dataNodes.push(bucketNode)
        }

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

        for (const connection of lakehouseConnections) {
            const node = await this.createLakehouseNode(project, connection, region)
            dataNodes.push(node)
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
            const datazoneClient = await DataZoneClient.getInstance(this.authProvider)
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

            const s3ConnectionNode = createS3ConnectionNode(
                connection,
                connectionCredentialsProvider,
                getConnectionResponse.location?.awsRegion || region
            )

            const accessGrantNodes = await createS3AccessGrantNodes(
                connection,
                connectionCredentialsProvider,
                getConnectionResponse.location?.awsRegion || region,
                getConnectionResponse.location?.awsAccountId
            )

            return [s3ConnectionNode, ...accessGrantNodes]
        } catch (connErr) {
            this.logger.error(`Failed to get S3 connection details: ${(connErr as Error).message}`)
            return [this.createErrorNode(`Failed to get S3 connection: ${(connErr as Error).message}`)]
        }
    }

    private async createRedshiftNode(
        project: DataZoneProject,
        connection: DataZoneConnection,
        region: string
    ): Promise<TreeNode> {
        try {
            const datazoneClient = await DataZoneClient.getInstance(this.authProvider)
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
            this.logger.error(`Failed to get Redshift connection details: ${(connErr as Error).message}`)
            return this.createErrorNode(`Failed to get Redshift connection: ${(connErr as Error).message}`)
        }
    }

    private async createLakehouseNode(
        project: DataZoneProject,
        connection: DataZoneConnection,
        region: string
    ): Promise<TreeNode> {
        try {
            const datazoneClient = await DataZoneClient.getInstance(this.authProvider)
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

            return createLakehouseConnectionNode(connection, connectionCredentialsProvider, region)
        } catch (connErr) {
            this.logger.error(`Failed to get Lakehouse connection details: ${(connErr as Error).message}`)
            return this.createErrorNode(`Failed to get Lakehouse connection: ${(connErr as Error).message}`)
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
                const s3Nodes: TreeNode[] = []
                for (const connection of s3Connections) {
                    const nodes = await this.createS3Node(project, connection, region)
                    s3Nodes.push(...nodes)
                }
                return s3Nodes
            },
            getParent: () => this,
        }
    }

    private createErrorNode(message: string): TreeNode {
        return {
            id: 'error-node',
            resource: {},
            getTreeItem: () => createErrorTreeItem(message),
            getParent: () => this,
        }
    }
}
