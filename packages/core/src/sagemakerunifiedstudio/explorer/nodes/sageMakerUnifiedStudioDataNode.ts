/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'
import { getIcon } from '../../../shared/icons'

import { getLogger } from '../../../shared/logger/logger'
import { DataZoneClient, DataZoneConnection, DataZoneProject } from '../../shared/client/datazoneClient'
import { createS3ConnectionNode } from './s3Strategy'
import { createRedshiftConnectionNode } from './redshiftStrategy'
import { SageMakerUnifiedStudioProjectNode } from './sageMakerUnifiedStudioProjectNode'
import { createErrorTreeItem } from './utils'
import { AwsCredentialIdentity } from '@aws-sdk/types/dist-types/identity/AwsCredentialIdentity'
import { ConnectionType } from './types'

/**
 * Tree node representing a Data folder that contains S3 and Redshift connections
 */
export class SageMakerUnifiedStudioDataNode implements TreeNode {
    public readonly id = 'smusDataFolder'
    public readonly resource = {}
    private readonly logger = getLogger()
    private childrenNodes: TreeNode[] | undefined

    constructor(
        private readonly parent: SageMakerUnifiedStudioProjectNode,
        initialChildren: TreeNode[] = []
    ) {
        this.childrenNodes = initialChildren.length > 0 ? initialChildren : undefined
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

            const environmentCredentials = await this.getEnvironmentCredentials(project)
            if (!environmentCredentials) {
                return [this.createErrorNode('Failed to get credentials')]
            }

            const datazoneClient = DataZoneClient.getInstance()
            const connections = await datazoneClient.listConnections(project.domainId, undefined, project.id)
            this.logger.info(`Found ${connections.length} connections for project ${project.id}`)

            if (connections.length === 0) {
                this.childrenNodes = []
                return []
            }

            const dataNodes = await this.createConnectionNodes(project, connections, environmentCredentials)
            this.childrenNodes = dataNodes
            return dataNodes
        } catch (err) {
            this.logger.error(`Failed to get connections: ${(err as Error).message}`)
            return [this.createErrorNode(`Failed to get connections: ${(err as Error).message}`)]
        }
    }

    private async getEnvironmentCredentials(project: DataZoneProject): Promise<AwsCredentialIdentity | undefined> {
        const datazoneClient = DataZoneClient.getInstance()
        this.logger.info(`Getting tooling environment credentials for project ${project.id}`)

        const envCredsResponse = await datazoneClient.getProjectDefaultEnvironmentCreds(project.domainId, project.id)

        if (!envCredsResponse?.accessKeyId || !envCredsResponse?.secretAccessKey || !envCredsResponse?.sessionToken) {
            this.logger.warn('Tooling environment credentials are incomplete or missing')
            return undefined
        }

        return {
            accessKeyId: envCredsResponse.accessKeyId,
            secretAccessKey: envCredsResponse.secretAccessKey,
            sessionToken: envCredsResponse.sessionToken,
        }
    }

    private async createConnectionNodes(
        project: DataZoneProject,
        connections: DataZoneConnection[],
        environmentCredentials: AwsCredentialIdentity
    ): Promise<TreeNode[]> {
        const datazoneClient = DataZoneClient.getInstance()
        const region = datazoneClient.getRegion()
        const dataNodes: TreeNode[] = []

        // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
        const s3Connections = connections.filter((conn) => conn.type === ConnectionType.S3)
        // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
        const redshiftConnections = connections.filter((conn) => conn.type === ConnectionType.REDSHIFT)

        for (const connection of s3Connections) {
            const node = await this.createS3Node(project, connection, environmentCredentials, region)
            dataNodes.push(node)
        }

        for (const connection of redshiftConnections) {
            const node = await this.createRedshiftNode(project, connection, environmentCredentials)
            dataNodes.push(node)
        }

        this.logger.info(`Created ${dataNodes.length} total connection nodes`)
        return dataNodes
    }

    private async createS3Node(
        project: DataZoneProject,
        connection: DataZoneConnection,
        environmentCredentials: AwsCredentialIdentity,
        region: string
    ): Promise<TreeNode> {
        try {
            const datazoneClient = DataZoneClient.getInstance()
            const getConnectionResponse = await datazoneClient.getConnection({
                domainIdentifier: project.domainId,
                identifier: connection.connectionId,
                withSecret: true,
            })

            // Extract connection credentials, fall back to environment credentials if connection credentials not present
            const connectionCredentials = getConnectionResponse.connectionCredentials || environmentCredentials
            return createS3ConnectionNode(connection, connectionCredentials as AwsCredentialIdentity, region)
        } catch (connErr) {
            this.logger.error(`Failed to get S3 connection details: ${(connErr as Error).message}`)
            this.logger.info(`Created S3 connection node with fallback credentials`)
            // Fall back to using environment credentials
            return createS3ConnectionNode(connection, environmentCredentials, region)
        }
    }

    private async createRedshiftNode(
        project: DataZoneProject,
        connection: DataZoneConnection,
        environmentCredentials: AwsCredentialIdentity
    ): Promise<TreeNode> {
        try {
            const datazoneClient = DataZoneClient.getInstance()
            const getConnectionResponse = await datazoneClient.getConnection({
                domainIdentifier: project.domainId,
                identifier: connection.connectionId,
                withSecret: true,
            })

            // Extract connection credentials, fall back to environment credentials if connection credentials not present
            const connectionCredentials = getConnectionResponse.connectionCredentials || environmentCredentials
            return createRedshiftConnectionNode(connection, connectionCredentials as AwsCredentialIdentity)
        } catch (connErr) {
            this.logger.error(`Failed to get Redshift connection details: ${(connErr as Error).message}`)
            this.logger.info(`Created Redshift connection node with fallback credentials`)
            // Fall back to using environment credentials

            return createRedshiftConnectionNode(connection, environmentCredentials)
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

    public getTreeItem(): vscode.TreeItem {
        const item = new vscode.TreeItem('Data', vscode.TreeItemCollapsibleState.Collapsed)
        item.iconPath = getIcon('vscode-folder')
        item.contextValue = 'dataFolder'
        return item
    }

    public getParent(): TreeNode | undefined {
        return this.parent
    }
}
