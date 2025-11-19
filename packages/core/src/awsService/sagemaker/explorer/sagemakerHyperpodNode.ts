/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { PlaceholderNode } from '../../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../../shared/treeview/utils'
import { HyperpodCluster, HyperpodDevSpace, KubectlClient } from '../../../shared/clients/kubectlClient'
import { SagemakerDevSpaceNode } from './sagemakerDevSpaceNode'
import { PollingSet } from '../../../shared/utilities/pollingSet'
import { SagemakerConstants } from './constants'
import { SagemakerClient } from '../../../shared/clients/sagemaker'
import { DescribeClusterCommand, EKSClient } from '@aws-sdk/client-eks'
import { GetCallerIdentityResponse } from 'aws-sdk/clients/sts'
import { DefaultStsClient } from '../../../shared/clients/stsClient'
import { updateInPlace } from '../../../shared/utilities/collectionUtils'
import { getLogger } from '../../../shared/logger/logger'

export const hyperpodContextValue = 'awsSagemakerHyperpodNode'

export class SagemakerHyperpodNode extends AWSTreeNodeBase {
    public readonly hyperpodDevSpaceNodes: Map<string, SagemakerDevSpaceNode>
    public allSpaces: Map<string, { cluster: HyperpodCluster; devSpace: HyperpodDevSpace }> = new Map()
    public readonly kubectlClients: Map<string, KubectlClient> = new Map()
    public readonly eksClient: EKSClient
    protected stsClient: DefaultStsClient
    callerIdentity: GetCallerIdentityResponse = {}
    clusterNamespaces: Map<string, HyperpodDevSpace> = new Map()
    public readonly pollingSet: PollingSet<string> = new PollingSet(5000, this.updatePendingNodes.bind(this))

    public constructor(
        public override readonly regionCode: string,
        protected readonly sagemakerClient: SagemakerClient
    ) {
        super('HyperPod', vscode.TreeItemCollapsibleState.Collapsed)
        this.contextValue = hyperpodContextValue
        this.eksClient = this.sagemakerClient.getEKSClient()
        this.stsClient = new DefaultStsClient(regionCode)
        this.hyperpodDevSpaceNodes = new Map<string, SagemakerDevSpaceNode>()
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        const result = await makeChildrenNodes({
            getChildNodes: async () => {
                await this.updateChildren()
                return [...this.hyperpodDevSpaceNodes.values()]
            },
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, SagemakerConstants.HyperPodPlaceHolderMessage),
            sort: (nodeA, nodeB) => nodeA.name.localeCompare(nodeB.name),
        })

        return result
    }

    public async listSpaces(): Promise<Map<string, { cluster: HyperpodCluster; devSpace: HyperpodDevSpace }>> {
        try {
            const clusters = await this.sagemakerClient.listHyperpodClusters()
            if (!clusters) {
                void vscode.window.showErrorMessage(`Error: No hyperpod clusters found`)
                throw new Error(`Error: No hyperpod cluster found`)
            }
            const spaceMap: Map<string, { cluster: HyperpodCluster; devSpace: HyperpodDevSpace }> = new Map()

            for (const cluster of clusters) {
                if (!cluster.eksClusterName) {
                    getLogger().warn(`HyperPod cluster ${cluster.clusterName} does not have an EKS cluster`)
                    continue
                }

                const eksCommand = new DescribeClusterCommand({
                    name: cluster.eksClusterName,
                })
                const eksResponse = await this.eksClient.send(eksCommand)
                if (!eksResponse) {
                    getLogger().warn(`Error: Invalid response`)
                    continue
                }

                const eksCluster = eksResponse.cluster
                if (!eksCluster) {
                    getLogger().warn(
                        `Error: EKS cluster ${cluster.eksClusterName} not found in region ${cluster.regionCode}`
                    )
                    continue
                }

                const kcClient = new KubectlClient(eksCluster, cluster)
                if (!this.kubectlClients.has(cluster.clusterName)) {
                    this.kubectlClients.set(cluster.clusterName, kcClient)
                }
                const spacesPerCluster = await kcClient.getSpacesForCluster(eksCluster)
                if (!spacesPerCluster) {
                    getLogger().warn(`Error: No spaces found in eks cluster ${cluster.eksClusterName}`)
                    continue
                }

                for (const devSpace of spacesPerCluster) {
                    const key = this.getWorkspaceKey(devSpace)
                    spaceMap.set(key, { cluster, devSpace })
                }
            }
            return spaceMap
        } catch (error) {
            void vscode.window.showErrorMessage(`Error: No workspaces listed`)
            throw new Error(`Error: No workspaces listed`)
        }
    }

    public async updateChildren(): Promise<void> {
        this.allSpaces = await this.listSpaces()
        const filterSpaces = new Map(this.allSpaces)
        this.callerIdentity = await this.stsClient.getCallerIdentity()

        updateInPlace(
            this.hyperpodDevSpaceNodes,
            filterSpaces.keys(),
            (key: string) => this.hyperpodDevSpaceNodes.get(key)!.updateWorkspace(),
            (key: string) =>
                new SagemakerDevSpaceNode(
                    this,
                    filterSpaces.get(key)!.devSpace,
                    filterSpaces.get(key)!.cluster,
                    this.regionCode
                )
        )
    }

    public trackPendingNode(devSpaceKey: string) {
        this.pollingSet.add(devSpaceKey)
    }

    private async updatePendingNodes() {
        for (const key of this.pollingSet) {
            const pendingDevSpaceNode = this.getHyperpodNode(key)
            await this.updatePendingHyperpodSpaceNode(pendingDevSpaceNode)
        }
    }

    private async updatePendingHyperpodSpaceNode(devSpaceNode: SagemakerDevSpaceNode) {
        await devSpaceNode.updateWorkspaceStatus()
        if (!devSpaceNode.isPending()) {
            this.pollingSet.delete(devSpaceNode.getDevSpaceKey())
            await devSpaceNode.refreshNode()
        }
    }

    public getKubectlClient(clusterName: string): KubectlClient {
        return this.kubectlClients.get(clusterName)!
    }

    private getHyperpodNode(key: string): SagemakerDevSpaceNode {
        const devSpaceNode = this.hyperpodDevSpaceNodes.get(key)
        if (devSpaceNode) {
            return devSpaceNode
        } else {
            throw new Error(`[Hyperpod] Devspace ${key} from polling set not found`)
        }
    }

    public getClusterNamespaceKey(space: HyperpodDevSpace): string {
        return `${space.cluster}-${space.namespace}`
    }

    public getWorkspaceKey(space: HyperpodDevSpace): string {
        return `${space.cluster}-${space.namespace}-${space.name}`
    }
}
