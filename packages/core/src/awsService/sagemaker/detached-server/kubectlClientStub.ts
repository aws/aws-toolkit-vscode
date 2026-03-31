/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as k8s from '@kubernetes/client-node'
import { AwsCredentialIdentity, Provider } from '@aws-sdk/types'
import { generateEksToken } from '../../../shared/clients/eksTokenGenerator'

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
        private readonly eksCluster: any,
        private readonly hyperpodCluster: HyperpodCluster,
        private readonly credentials: AwsCredentialIdentity | Provider<AwsCredentialIdentity>
    ) {
        this.kubeConfig = new k8s.KubeConfig()
    }

    static async create(
        eksCluster: any,
        hyperpodCluster: HyperpodCluster,
        credentials: AwsCredentialIdentity | Provider<AwsCredentialIdentity>
    ): Promise<KubectlClient> {
        const client = new KubectlClient(eksCluster, hyperpodCluster, credentials)
        await client.initKubeConfig()
        return client
    }

    getEksCluster(): any {
        return this.eksCluster
    }

    async createWorkspaceConnection(devSpace: HyperpodDevSpace): Promise<WorkspaceConnectionResult> {
        try {
            await this.ensureValidToken()

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

            const response = await this.k8sApi.createNamespacedCustomObject(
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

            return { type: connectionType || 'vscode-remote', url: presignedUrl, token, sessionId }
        } catch (error) {
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
}
