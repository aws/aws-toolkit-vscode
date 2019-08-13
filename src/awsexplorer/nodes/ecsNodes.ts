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
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { RegionNode } from '../../shared/treeview/nodes/regionNode'
import {
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
    //private readonly taskDefinitionsNode: EcsTaskDefinitionsNode

    public constructor(
        public readonly parent: RegionNode,
        private readonly getExtensionAbsolutePath: (relativeExtensionPath: string) => string
    ) {
        super('ECS', vscode.TreeItemCollapsibleState.Collapsed)
        this.clustersNode = new DefaultEcsClustersNode(this, this.getExtensionAbsolutePath)
        //this.taskDefinitionsNode = new DefaultEcsTaskDefinitionsNode(this, this.getExtensionAbsolutePath)
        this.update()
    }

    public get regionCode(): string {
        return this.parent.regionCode
    }

    public async getChildren(): Promise<AWSTreeErrorHandlerNode[]> {
        return [
            this.clustersNode,
            //this.taskDefinitionsNode
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
        super('Clusters', vscode.TreeItemCollapsibleState.Collapsed)
        this.clusterNodes = new Map<string, EcsClusterNode>()
    }

    public get regionCode(): string {
        return this.parent.regionCode
    }

    public async getChildren(): Promise<(EcsClusterNode | ErrorNode)[]> {
        await this.handleErrorProneOperation(
            async () => this.updateChildren(),
            'localized string here'
        )

        return !!this.errorNode ? [this.errorNode]
            : [...this.clusterNodes.values()]
                .sort((nodeA, nodeB) =>
                    nodeA.name.localeCompare(
                        nodeB.name
                    )
                )
    }

    public async updateChildren(): Promise<void> {

        const client: EcsClient = ext.toolkitClientBuilder.createEcsClient(this.regionCode)
        const clusters = await toMapAsync(
            asyncIterableIteratorFromAwsClient<string>(client.listClusters(), 'localized string here'),
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

// export class DefaultEcsTaskDefinitionsNode extends AWSTreeErrorHandlerNode implements EcsTaskDefinitionsNode {
//     private readonly taskDefinitionNodes: Map<string, EcsTaskDefinitionNode>

//     public constructor(
//         public readonly parent: EcsNode,
//         private readonly getExtensionAbsolutePath: (relativeExtensionPath: string) => string
//     ) {
//         super('ECSClusters', vscode.TreeItemCollapsibleState.Collapsed)
//         this.taskDefinitionNodes = new Map<string, EcsTaskDefinitionNode>()
//         // TODO: Get new icons
//         // this.iconPath = {
//         //     dark: vscode.Uri.file(this.getExtensionAbsolutePath('resources/dark/cloudformation.svg')),
//         //     light: vscode.Uri.file(this.getExtensionAbsolutePath('resources/light/cloudformation.svg')),
//         // }
//     }

//     public update()
// }

export class DefaultEcsClusterNode extends AWSTreeErrorHandlerNode implements EcsClusterNode {

    public get regionCode(): string {
        return this.parent.regionCode
    }

    private readonly servicesNode: EcsServicesNode

    public constructor(
        public readonly parent: EcsClustersNode,
        public name: string,
        private readonly getExtensionAbsolutePath: (relativeExtensionPath: string) => string
    ) {
        super('', vscode.TreeItemCollapsibleState.Collapsed)
        this.servicesNode = new DefaultEcsServicesNode(this, this.getExtensionAbsolutePath)
        // TODO: Get new icons
        this.iconPath = {
            dark: vscode.Uri.file(this.getExtensionAbsolutePath('resources/dark/cloudformation.svg')),
            light: vscode.Uri.file(this.getExtensionAbsolutePath('resources/light/cloudformation.svg')),
        }
        this.update(name)
    }

    public update(name: string) {
        this.name = name
        this.label = name
    }

    public async getChildren() {
        return [this.servicesNode]
    }
}

export class DefaultEcsServicesNode extends AWSTreeErrorHandlerNode implements EcsServicesNode {
    private readonly serviceNodes: Map<string, EcsServiceNode>

    public get regionCode(): string {
        return this.parent.regionCode
    }

    public constructor(
        public readonly parent: EcsClusterNode,
        private readonly getExtensionAbsolutePath: (relativeExtensionPath: string) => string
    ) {
        super('Services', vscode.TreeItemCollapsibleState.Collapsed)
        this.serviceNodes = new Map<string, EcsServiceNode>()
        // TODO: Get new icons
        this.iconPath = {
            dark: vscode.Uri.file(this.getExtensionAbsolutePath('resources/dark/cloudformation.svg')),
            light: vscode.Uri.file(this.getExtensionAbsolutePath('resources/light/cloudformation.svg')),
        }
    }

    public async getChildren() {
        await this.handleErrorProneOperation(
            async () => this.updateChildren(),
            'localized string here'
        )

        if (!!this.errorNode) {
            return [this.errorNode]
        }

        if (this.serviceNodes.size > 0) {
            return [...this.serviceNodes.values()]
            .sort((nodeA, nodeB) =>
                nodeA.name.localeCompare(
                    nodeB.name
                )
            )
        }

        return [
            new PlaceholderNode(
                this,
                'localized string here'
            )
        ]
    }

    public async updateChildren() {
        const client: EcsClient = ext.toolkitClientBuilder.createEcsClient(this.regionCode)
        const services = await toMapAsync(
            asyncIterableIteratorFromAwsClient<string>(client.listServices(this.parent.name), 'localized string here'),
            service => service
        )

        updateInPlace(
            this.serviceNodes,
            services.keys(),
            key => this.serviceNodes.get(key)!.update(services.get(key)!),
            key => new DefaultEcsServiceNode(
                this,
                services.get(key)!,
                relativeExtensionPath => this.getExtensionAbsolutePath(relativeExtensionPath)
            )
        )
    }
}

export class DefaultEcsServiceNode extends AWSTreeErrorHandlerNode implements EcsServiceNode {

    public get regionCode(): string {
        return this.parent.regionCode
    }

    public constructor(
        public readonly parent: EcsServicesNode,
        public name: string,
        private readonly getExtensionAbsolutePath: (relativeExtensionPath: string) => string
    ) {
        super('', vscode.TreeItemCollapsibleState.Collapsed)
        // TODO: Get new icons
        this.iconPath = {
            dark: vscode.Uri.file(this.getExtensionAbsolutePath('resources/dark/cloudformation.svg')),
            light: vscode.Uri.file(this.getExtensionAbsolutePath('resources/light/cloudformation.svg')),
        }
        this.update(name)
    }

    public update(name: string) {
        this.name = name
        this.label = name
    }
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
