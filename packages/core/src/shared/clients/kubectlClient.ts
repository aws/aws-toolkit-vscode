/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as k8s from '@kubernetes/client-node'
import { getLogger } from '../logger/logger'
import { Cluster } from '@aws-sdk/client-eks'
import globals from '../extensionGlobals'

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

export class KubectlClient {
    private kubeConfig: k8s.KubeConfig
    private k8sApi?: k8s.CustomObjectsApi

    public constructor(eksCluster: Cluster, hyperpodCluster: HyperpodCluster) {
        this.kubeConfig = new k8s.KubeConfig()
        this.loadKubeConfig(eksCluster, hyperpodCluster)
        this.k8sApi = this.kubeConfig.makeApiClient(k8s.CustomObjectsApi)
    }

    async getSpacesForCluster(eksCluster: Cluster): Promise<HyperpodDevSpace[]> {
        try {
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
                throw new Error(
                    `Error: User has insufficient permissions to view EKS cluster (${eksCluster.name}) or its spaces.`
                )
            }

            getLogger().error(
                `Error: Unavailable spaces for EKS Cluster (${eksCluster.name}): ${error}\nStack trace: ${(error as Error).stack}`
            )
        }
        return []
    }

    private loadKubeConfig(eksCluster: Cluster, hyperpodCluster: HyperpodCluster): void {
        if (eksCluster.name && eksCluster.endpoint) {
            const credentialId = globals.awsContext.getCredentialProfileName()
            const awsProfile = credentialId?.startsWith('profile:') ? credentialId.split('profile:')[1] : credentialId
            this.kubeConfig.loadFromOptions({
                clusters: [
                    {
                        name: eksCluster.name,
                        server: eksCluster.endpoint,
                        caData: eksCluster.certificateAuthority?.data,
                        skipTLSVerify: false,
                    },
                ],
                users: [
                    {
                        name: eksCluster.name,
                        exec: {
                            apiVersion: 'client.authentication.k8s.io/v1beta1',
                            command: 'aws',
                            args: [
                                'eks',
                                'get-token',
                                '--cluster-name',
                                eksCluster.name,
                                '--region',
                                hyperpodCluster.regionCode,
                            ],
                            env: [
                                {
                                    name: 'AWS_PROFILE',
                                    value: awsProfile,
                                },
                            ],
                            interactiveMode: 'Never',
                        },
                    },
                ],
                contexts: [
                    {
                        name: eksCluster.name,
                        cluster: eksCluster.name,
                        user: eksCluster.name,
                    },
                ],
                currentContext: eksCluster.name,
            })
        }
    }

    async getHyperpodSpaceStatus(devSpace: HyperpodDevSpace): Promise<string> {
        try {
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
