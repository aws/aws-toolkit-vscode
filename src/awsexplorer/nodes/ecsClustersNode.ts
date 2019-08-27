/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { EcsClient } from '../../shared/clients/ecsClient'
import { ext } from '../../shared/extensionGlobals'
import { AWSTreeErrorHandlerNode } from '../../shared/treeview/nodes/awsTreeErrorHandlerNode'
import { ErrorNode } from '../../shared/treeview/nodes/errorNode'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { asyncIterableWithStatusBarUpdate, toMapAsync, updateInPlace } from '../../shared/utilities/collectionUtils'
import { DefaultEcsClusterNode } from './ecsClusterNode'
import { EcsClusterNode, EcsClustersNode, EcsNode } from './ecsNodeInterfaces'

export class DefaultEcsClustersNode extends AWSTreeErrorHandlerNode implements EcsClustersNode {

    public get regionCode(): string {
        return this.parent.regionCode
    }
    private readonly clusterNodes: Map<string, EcsClusterNode>

    public constructor(
        public readonly parent: EcsNode,
        private readonly getExtensionAbsolutePath: (relativeExtensionPath: string) => string
    ) {
        super('Clusters', vscode.TreeItemCollapsibleState.Collapsed)
        this.clusterNodes = new Map<string, EcsClusterNode>()
    }

    public async getChildren(): Promise<(EcsClusterNode | ErrorNode | PlaceholderNode)[]> {
        await this.handleErrorProneOperation(
            async () => this.updateChildren(),
            localize(
                'AWS.explorerNode.ecs.clusters.error',
                'Error loading ECS clusters'
            )
        )

        if (!!this.errorNode) {
            return [this.errorNode]
        }

        if (this.clusterNodes.size > 0) {
            return [...this.clusterNodes.values()]
            .sort((nodeA, nodeB) =>
                nodeA.arn.localeCompare(
                    nodeB.arn
                )
            )
        }

        return [
            new PlaceholderNode(
                this,
                localize(
                    'AWS.explorerNode.ecs.clusters.none',
                    'No clusters found'
                )
            )
        ]
    }

    protected async getEcsClusters() {
        const client: EcsClient = ext.toolkitClientBuilder.createEcsClient(this.regionCode)

        return await toMapAsync(
            asyncIterableWithStatusBarUpdate<string>(
                client.listClusters(),
                localize('AWS.explorerNode.ecs.clusters.loading', 'Loading ECS clusters...')
            ),
            cluster => cluster
        )
    }

    private async updateChildren(): Promise<void> {

        const clusters = await this.getEcsClusters()

        updateInPlace(
            this.clusterNodes,
            clusters.keys(),
            key => this.clusterNodes.get(key)!.update(clusters.get(key)!),
            key => new DefaultEcsClusterNode(
                this,
                clusters.get(key)!,
                relativeExtensionPath => this.getExtensionAbsolutePath(relativeExtensionPath)
            )
        )
    }
}
