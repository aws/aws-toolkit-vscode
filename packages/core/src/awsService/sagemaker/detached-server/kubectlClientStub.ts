/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as k8s from '@kubernetes/client-node'

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

export class KubectlClient {
    private kubeConfig: k8s.KubeConfig
    private k8sApi: k8s.CustomObjectsApi
    private eksCluster: any

    constructor(eksCluster: any, hyperpodCluster: HyperpodCluster) {
        this.eksCluster = eksCluster
        this.kubeConfig = new k8s.KubeConfig()
        this.loadKubeConfig(eksCluster, hyperpodCluster)
        this.k8sApi = this.kubeConfig.makeApiClient(k8s.CustomObjectsApi)
    }

    getEksCluster(): any {
        return this.eksCluster
    }

    private loadKubeConfig(eksCluster: any, hyperpodCluster: HyperpodCluster): void {
        if (eksCluster.name && eksCluster.endpoint) {
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

    async createWorkspaceConnection(devSpace: HyperpodDevSpace): Promise<{ type: string; url: string }> {
        try {
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
            const presignedUrl = body.status?.workspaceConnectionUrl
            const connectionType = body.status?.workspaceConnectionType

            return { type: connectionType || 'vscode-remote', url: presignedUrl }
        } catch (error) {
            throw new Error(
                `Failed to create workspace connection: ${error instanceof Error ? error.message : String(error)}`
            )
        }
    }
}
