/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../logger/logger'
import { Cluster } from '@aws-sdk/client-eks'
import { SagemakerDevSpaceNode } from '../../awsService/sagemaker/explorer/sagemakerDevSpaceNode'
import { AwsCredentialIdentity, Provider } from '@aws-sdk/types'
import {
    KubectlClient as KubectlClientBase,
    HyperpodDevSpace,
    HyperpodCluster,
    WorkspaceConnectionResult,
    EksClusterInfo,
} from '../../awsService/sagemaker/detached-server/kubectlClientStub'

export type { HyperpodDevSpace, HyperpodCluster, WorkspaceConnectionResult, EksClusterInfo }

export class KubectlClient extends KubectlClientBase {
    private constructor(
        eksCluster: Cluster,
        hyperpodCluster: HyperpodCluster,
        credentials: AwsCredentialIdentity | Provider<AwsCredentialIdentity>
    ) {
        super(eksCluster, hyperpodCluster, credentials)
    }

    static override async createForCluster(
        eksCluster: Cluster,
        hyperpodCluster: HyperpodCluster,
        credentials: AwsCredentialIdentity | Provider<AwsCredentialIdentity>
    ): Promise<KubectlClient> {
        const client = new KubectlClient(eksCluster, hyperpodCluster, credentials)
        await client.initKubeConfig()
        return client
    }

    override getEksCluster(): Cluster {
        return super.getEksCluster() as Cluster
    }

    async getSpacesForCluster(eksCluster: Cluster): Promise<HyperpodDevSpace[]> {
        try {
            await this.ensureValidToken()
            const group = 'workspace.jupyter.org'
            const version = 'v1alpha1'
            const plural = 'workspaces'

            const res = await this.getApi().listClusterCustomObject(group, version, plural)
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
            const response = await this.getApi().getNamespacedCustomObject(
                devSpace.group,
                devSpace.version,
                devSpace.namespace,
                devSpace.plural,
                devSpace.name
            )

            const statusObj = (response.body as any).status
            const desiredStatus = (response.body as any).spec?.desiredStatus
            const conditions = statusObj?.conditions
            return this.getStatusFromConditions(conditions, desiredStatus)
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

            await this.getApi().patchNamespacedCustomObject(
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

    override async createWorkspaceConnection(devSpace: HyperpodDevSpace): Promise<WorkspaceConnectionResult> {
        getLogger().info(`[Hyperpod] Creating workspace connection for space: ${devSpace.name}`)
        try {
            const result = await super.createWorkspaceConnection(devSpace)
            if (!result.url) {
                throw new Error('No workspace connection URL returned')
            }
            getLogger().info(`Connection Type: ${result.type}`)
            return result
        } catch (error) {
            getLogger().error(`[Hyperpod] Failed to create workspace connection: ${error}`)
            throw error
        }
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
