/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { EcsClient } from '../../shared/clients/ecsClient'
import { ext } from '../../shared/extensionGlobals'
import { AWSTreeErrorHandlerNode } from '../../shared/treeview/nodes/awsTreeErrorHandlerNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { ErrorNode } from '../../shared/treeview/nodes/errorNode'
import { RegionNode } from '../../shared/treeview/nodes/regionNode'
import {
    intersection,
    toArrayAsync,
    toMap,
    toMapAsync,
    updateInPlace
} from '../../shared/utilities/collectionUtils'
import {
    EcsClusterNode,
    EcsClustersNode,
    EcsNode,
    EcsServiceNode,
    EcsServicesNode,
    EcsTaskDefinitionNode,
    EcsTaskDefinitionsNode
} from './ecsNodeInterfaces'

export class DefaultEcsNode extends AWSTreeNodeBase implements EcsNode {
    private readonly clustersNode: EcsClustersNode
    private readonly taskDefinitionsNode: EcsTaskDefinitionsNode

    public constructor(
        public readonly parent: RegionNode,
        private readonly getExtensionAbsolutePath: (relativeExtensionPath: string) => string
    ) {
        super('ECS', vscode.TreeItemCollapsibleState.Collapsed)
        this.clustersNode = new DefaultEcsClustersNode(this, this.getExtensionAbsolutePath)
        this.taskDefinitionsNode = new DefaultEcsTaskDefinitionsNode(this, this.getExtensionAbsolutePath)
        this.update()
    }

    public get regionCode(): string {
        return this.parent.regionCode
    }

    public async getChildren(): Promise<AWSTreeErrorHandlerNode[]> {
        return [
            this.clustersNode,
            this.taskDefinitionsNode
        ]
    }

    public update(): void {
        this.tooltip = 'temp'
    }
}

export class DefaultEcsClustersNode extends AWSTreeErrorHandlerNode implements EcsClustersNode {
    private readonly clusterNodes: Map<string, EcsClusterNode>

    public constructor(
        public readonly parent: EcsNode,
        private readonly getExtensionAbsolutePath: (relativeExtensionPath: string) => string
    ) {
        super('ECSClusters', vscode.TreeItemCollapsibleState.Collapsed)
        this.clusterNodes = new Map<string, EcsClusterNode>()
        // TODO: Get new icons
        // this.iconPath = {
        //     dark: vscode.Uri.file(this.getExtensionAbsolutePath('resources/dark/cloudformation.svg')),
        //     light: vscode.Uri.file(this.getExtensionAbsolutePath('resources/light/cloudformation.svg')),
        // }
    }

    public get regionCode(): string {
        return this.parent.regionCode
    }

    public async getChildren(): Promise<(EcsClusterNode | ErrorNode)[]> {
        await this.handleErrorProneOperation(
            async () => this.updateChildren(),
            localize(
                'AWS.explorerNode.cloudFormation.error',
                'Error loading CloudFormation resources'
            ))

        return !!this.errorNode ? [this.errorNode]
            : [...this.stackNodes.values()]
                .sort((nodeA, nodeB) =>
                    nodeA.stackName.localeCompare(
                        nodeB.stackName
                    )
                )
    }

    public async updateChildren(): Promise<void> {

        const client: EcsClient = ext.toolkitClientBuilder.createEcsClient(this.regionCode)
        //const clusters = await toMapAsync(listCloudFormationStacks(client), cluster => cluster.StackId)
        const clusters = await toMapAsync(
            asyncIterableIteratorFromAwsClient(client.listClusters(), 'asdf'),
            cluster => cluster
        )

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

export class DefaultEcsTaskDefinitionsNode extends AWSTreeErrorHandlerNode implements EcsTaskDefinitionsNode {
    private readonly taskDefinitionNodes: Map<string, EcsTaskDefinitionNode>

    public constructor(
        public readonly parent: EcsNode,
        private readonly getExtensionAbsolutePath: (relativeExtensionPath: string) => string
    ) {
        super('ECSClusters', vscode.TreeItemCollapsibleState.Collapsed)
        this.taskDefinitionNodes = new Map<string, EcsTaskDefinitionNode>()
        // TODO: Get new icons
        // this.iconPath = {
        //     dark: vscode.Uri.file(this.getExtensionAbsolutePath('resources/dark/cloudformation.svg')),
        //     light: vscode.Uri.file(this.getExtensionAbsolutePath('resources/light/cloudformation.svg')),
        // }
    }
}

export class DefaultEcsClusterNode extends AWSTreeErrorHandlerNode implements EcsClusterNode {
    private readonly servicesNode: EcsServicesNode
}

export class DefaultEcsServicesNode extends AWSTreeErrorHandlerNode implements EcsServicesNode {
    private readonly serviceNodes: Map<string, EcsServiceNode>
}

async function* asyncIterableIteratorFromAwsClient<T>(
    iterableFromClient: AsyncIterable<T>,
    statusMessage: string
): AsyncIterableIterator<T> {
    const status = vscode.window.setStatusBarMessage(statusMessage)

    try {
        yield* iterableFromClient

    } finally {
        status.dispose()
    }
}

// define task and service
