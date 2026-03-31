/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as k8s from '@kubernetes/client-node'
import { getLogger } from '../logger/logger'
import { Cluster } from '@aws-sdk/client-eks'
import { SagemakerDevSpaceNode } from '../../awsService/sagemaker/explorer/sagemakerDevSpaceNode'
import { AwsCredentialIdentity, Provider } from '@aws-sdk/types'
import { generateEksToken } from './eksTokenGenerator'

export interface HyperpodDevSpace {
    name: string
    namespace: string
    cluster: string
    group: string
    version: string
    plural: string
    status: string
    appType: string
    creator: string
    accessType: string
}

export interface HyperpodCluster {
    clusterName: string
    clusterArn: string
    status: string
    eksClusterName?: string
    eksClusterArn?: string
    regionCode: string
}

export interface WorkspaceConnectionResult {
    type: string
    url: string
    token: string
    sessionId: string
}

/** Refresh the token 1 minute before it expires. */
const tokenRefreshBufferMs = 60_000

export class KubectlClient {
    private kubeConfig: k8s.KubeConfig
    private k8sApi!: k8s.CustomObjectsApi
    private tokenExpiry: number = 0

    private constructor(
        private readonly eksCluster: Cluster,
        private readonly hyperpodCluster: HyperpodCluster,
        private readonly credentials: AwsCredentialIdentity | Provider<AwsCredentialIdentity>
    ) {
        this.kubeConfig = new k8s.KubeConfig()
    }

    static async create(
        eksCluster: Cluster,
        hyperpodCluster: HyperpodCluster,
        credentials: AwsCredentialIdentity | Provider<AwsCredentialIdentity>
    ): Promise<KubectlClient> {
        const client = new KubectlClient(eksCluster, hyperpodCluster, credentials)
        await client.initKubeConfig()
        return client
    }

    getEksCluster(): Cluster {
        return this.eksCluster
    }

    async getSpacesForCluster(eksCluster: Cluster): Promise<HyperpodDevSpace[]> {
        try {
            await this.ensureValidToken()
            const group = 'workspace.jupyter.org'
            const version = 'v1alpha1'
            const plural = 'workspaces'

            const res = await this.k8sApi!.listClusterCustomObject(group, version, plural)
            if (!res) {
                getLogger().info(`No cluster custom object found`)
                return []
            }

            if ((res as any).body?.items) {
                return (res as any).body.items.map((space: any) => ({
                    name: space.metadata?.name,
                    namespace: space.metadata?.namespace,
                    cluster: eksCluster.name,
                    status: this.getStatusFromConditions(space.status?.conditions, space.spec?.desiredStatus),
                    group,
                    version,
                    plural,
                    appType: space.spec?.appType,
                    creator: space.metadata?.annotations['workspace.jupyter.org/created-by'],
                    accessType: space.spec?.accessType,
                }))
            }
        } catch (error: any) {
            if (error.statusCode === 403 || error.statusCode === 401) {
                void vscode.window.showErrorMessage(
                    `You do not have permission to view ${eksCluster.name} or its spaces. Please contact your administrator.`
                )
                getLogger().warn(
                    `[Warning]: User has insufficient permissions to view EKS cluster (${eksCluster.name}) or its spaces.`
                )
            }

            getLogger().warn(
                `[Warning]: Unavailable spaces for EKS Cluster (${eksCluster.name}): ${error}\nStack trace: ${(error as Error).stack}`
            )
        }
        return []
    }

    async getHyperpodSpaceStatus(devSpace: HyperpodDevSpace): Promise<string> {
        try {
            await this.ensureValidToken()
            const response = await this.k8sApi!.getNamespacedCustomObject(
                devSpace.group,
                devSpace.version,
                devSpace.namespace,
                devSpace.plural,
                devSpace.name
            )

            const statusObj = (response.body as any).status
            const desiredStatus = (response.body as any).spec?.desiredStatus
            const conditions = statusObj?.conditions
            const currentStatus = this.getStatusFromConditions(conditions, desiredStatus)

            return currentStatus
        } catch (error) {
            throw new Error(`[Hyperpod] Failed to get status for devSpace: ${devSpace.name}`)
        }
    }

    async startHyperpodDevSpace(node: SagemakerDevSpaceNode): Promise<void> {
        getLogger().info(`[Hyperpod] Starting devSpace: %s`, node.devSpace.name)
        await this.patchDevSpaceStatus(node.devSpace, 'Running')
        node.devSpace.status = await this.getHyperpodSpaceStatus(node.devSpace)
        node.getParent().trackPendingNode(node.getDevSpaceKey())
    }

    async stopHyperpodDevSpace(node: SagemakerDevSpaceNode): Promise<void> {
        getLogger().info(`[Hyperpod] Stopping devSpace: %s`, node.devSpace.name)
        await this.patchDevSpaceStatus(node.devSpace, 'Stopped')
        node.devSpace.status = await this.getHyperpodSpaceStatus(node.devSpace)
        node.getParent().trackPendingNode(node.getDevSpaceKey())
    }

    async patchDevSpaceStatus(devSpace: HyperpodDevSpace, desiredStatus: 'Running' | 'Stopped'): Promise<void> {
        try {
            await this.ensureValidToken()
            const patchBody = {
                spec: {
                    desiredStatus: desiredStatus,
                },
            }

            await this.k8sApi!.patchNamespacedCustomObject(
                devSpace.group,
                devSpace.version,
                devSpace.namespace,
                devSpace.plural,
                devSpace.name,
                patchBody,
                undefined,
                undefined,
                undefined,
                { headers: { 'Content-Type': 'application/merge-patch+json' } }
            )
        } catch (error) {
            throw new Error(
                `[Hyperpod] Failed to update transitional status for devSpace ${devSpace.name}: ${(error as Error).message}`
            )
        }
    }

    async createWorkspaceConnection(devSpace: HyperpodDevSpace): Promise<WorkspaceConnectionResult> {
        try {
            await this.ensureValidToken()
            getLogger().info(`[Hyperpod] Creating workspace connection for space: ${devSpace.name}`)

            const group = 'connection.workspace.jupyter.org'
            const version = 'v1alpha1'
            const plural = 'workspaceconnections'

            const workspaceConnection = {
                apiVersion: `${group}/${version}`,
                kind: 'WorkspaceConnection',
                metadata: {
                    namespace: devSpace.namespace,
                },
                spec: {
                    workspaceName: devSpace.name,
                    workspaceConnectionType: 'vscode-remote',
                },
            }

            getLogger().info(`[Hyperpod] Creating WorkspaceConnection: %O`, workspaceConnection)

            const response = await this.k8sApi!.createNamespacedCustomObject(
                group,
                version,
                devSpace.namespace,
                plural,
                workspaceConnection
            )

            const body = response.body as any
            const status = body.status
            const presignedUrl = status?.workspaceConnectionUrl
            const connectionType = status?.workspaceConnectionType
            const token = status?.tokenValue ?? ''
            const sessionId = status?.sessionId ?? ''

            if (!presignedUrl) {
                throw new Error('No workspace connection URL returned')
            }

            getLogger().info(`Connection Type: ${connectionType}`)
            return { type: connectionType || 'vscode-remote', url: presignedUrl, token, sessionId }
        } catch (error) {
            getLogger().error(`[Hyperpod] Failed to create workspace connection: ${error}`)
            throw new Error(
                `Failed to create workspace connection: ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    private async initKubeConfig(): Promise<void> {
        if (!this.eksCluster.name || !this.eksCluster.endpoint) {
            return
        }

        const { token, expiresAt } = await generateEksToken(
            this.eksCluster.name,
            this.hyperpodCluster.regionCode,
            this.credentials
        )
        this.tokenExpiry = expiresAt.getTime()

        this.kubeConfig.loadFromOptions({
            clusters: [
                {
                    name: this.eksCluster.name,
                    server: this.eksCluster.endpoint,
                    caData: this.eksCluster.certificateAuthority?.data,
                    skipTLSVerify: false,
                },
            ],
            users: [
                {
                    name: this.eksCluster.name,
                    token,
                },
            ],
            contexts: [
                {
                    name: this.eksCluster.name,
                    cluster: this.eksCluster.name,
                    user: this.eksCluster.name,
                },
            ],
            currentContext: this.eksCluster.name,
        })

        this.k8sApi = this.kubeConfig.makeApiClient(k8s.CustomObjectsApi)
    }

    private async ensureValidToken(): Promise<void> {
        if (Date.now() >= this.tokenExpiry - tokenRefreshBufferMs) {
            await this.refreshToken()
        }
    }

    private async refreshToken(): Promise<void> {
        if (!this.eksCluster.name) {
            return
        }

        const { token, expiresAt } = await generateEksToken(
            this.eksCluster.name,
            this.hyperpodCluster.regionCode,
            this.credentials
        )
        this.tokenExpiry = expiresAt.getTime()

        const userIndex = this.kubeConfig.users.findIndex((u) => u.name === this.eksCluster.name)
        if (userIndex >= 0) {
            ;(this.kubeConfig.users[userIndex] as any).token = token
        }
        this.k8sApi = this.kubeConfig.makeApiClient(k8s.CustomObjectsApi)
    }

    private getStatusFromConditions(conditions: any[], desiredStatus?: string): string {
        if (!conditions) {
            return 'Unknown'
        }
        const getCondition = (type: string) => conditions.find((c: any) => c.type === type)?.status === 'True'

        const available = getCondition('Available')
        const progressing = getCondition('Progressing')
        const stopped = getCondition('Stopped')
        const degraded = getCondition('Degraded')

        if (degraded) {
            return 'Error'
        } else if (!available && progressing && desiredStatus === 'Running') {
            return 'Starting'
        } else if (!available && progressing && desiredStatus === 'Stopped') {
            return 'Stopping'
        } else if (available && !progressing && !stopped) {
            return 'Running'
        } else if (!available && !progressing && stopped) {
            return 'Stopped'
        } else {
            return 'Unknown'
        }
    }
}
