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

/** Buffer time (ms) before token expiry to trigger a proactive refresh, avoiding mid-request expirations. */
const tokenRefreshBufferMs = 60_000

export interface EksClusterInfo {
    name?: string
    endpoint?: string
    certificateAuthority?: { data?: string }
}

export class KubectlClient {
    private kubeConfig: k8s.KubeConfig
    private k8sApi: k8s.CustomObjectsApi | undefined
    private tokenExpiry: number = 0

    protected constructor(
        private readonly eksCluster: EksClusterInfo,
        private readonly hyperpodCluster: HyperpodCluster,
        private readonly credentials: AwsCredentialIdentity | Provider<AwsCredentialIdentity>
    ) {
        this.kubeConfig = new k8s.KubeConfig()
    }

    static async createForCluster(
        eksCluster: EksClusterInfo,
        hyperpodCluster: HyperpodCluster,
        credentials: AwsCredentialIdentity | Provider<AwsCredentialIdentity>
    ): Promise<KubectlClient> {
        const client = new KubectlClient(eksCluster, hyperpodCluster, credentials)
        await client.initKubeConfig()
        return client
    }

    getEksCluster(): EksClusterInfo {
        return this.eksCluster
    }

    protected getApi(): k8s.CustomObjectsApi {
        if (!this.k8sApi) {
            throw new Error('[Hyperpod] KubectlClient not initialized — call createForCluster()')
        }
        return this.k8sApi
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

            const response = await this.getApi().createNamespacedCustomObject(
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
            // tokenValue and sessionId may not be present in all API responses.
            // When empty, the existing connection flow in model.ts falls back to parsing these from the presigned URL.
            const token = status?.tokenValue ?? ''
            const sessionId = status?.sessionId ?? ''

            return { type: connectionType || 'vscode-remote', url: presignedUrl, token, sessionId }
        } catch (error) {
            throw new Error(
                `Failed to create workspace connection: ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }

    protected async initKubeConfig(): Promise<void> {
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

    protected async ensureValidToken(): Promise<void> {
        if (Date.now() >= this.tokenExpiry - tokenRefreshBufferMs) {
            await this.refreshToken()
        }
    }

    protected async refreshToken(): Promise<void> {
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
