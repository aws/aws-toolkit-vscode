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
        this.tooltip = 'localized tooltip here'
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
            'localized error here'
        )

        return !!this.errorNode ? [this.errorNode]
            : [...this.clusterNodes.values()]
                .sort((nodeA, nodeB) =>
                    nodeA.arn.localeCompare(
                        nodeB.arn
                    )
                )
    }

    public async updateChildren(): Promise<void> {

        const client: EcsClient = ext.toolkitClientBuilder.createEcsClient(this.regionCode)
        const clusters = await toMapAsync(
            asyncIterableIteratorFromAwsClient<string>(client.listClusters(), 'localized waiting message here'),
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
        super('Task Definitions', vscode.TreeItemCollapsibleState.Collapsed)
        this.taskDefinitionNodes = new Map<string, EcsTaskDefinitionNode>()
        // TODO: Get new icons
        // this.iconPath = {
        //     dark: vscode.Uri.file(this.getExtensionAbsolutePath('resources/dark/cloudformation.svg')),
        //     light: vscode.Uri.file(this.getExtensionAbsolutePath('resources/light/cloudformation.svg')),
        // }
    }

    public get regionCode(): string {
        return this.parent.regionCode
    }

    public async getChildren(): Promise<(EcsTaskDefinitionNode | ErrorNode)[]> {
        await this.handleErrorProneOperation(
            async () => this.updateChildren(),
            'localized failure message here'
        )

        return !!this.errorNode ? [this.errorNode]
            : [...this.taskDefinitionNodes.values()]
                .sort((nodeA, nodeB) =>
                    nodeA.arn.localeCompare(
                        nodeB.arn
                    )
                )
    }

    public async updateChildren(): Promise<void> {

        const client: EcsClient = ext.toolkitClientBuilder.createEcsClient(this.regionCode)
        const taskDefs = await toMapAsync(
            asyncIterableIteratorFromAwsClient<string>(client.listTaskDefinitions(), 'localized waiting message here'),
            cluster => cluster
        )

        updateInPlace(
            this.taskDefinitionNodes,
            taskDefs.keys(),
            key => this.taskDefinitionNodes.get(key)!.update(taskDefs.get(key)!),
            key => new DefaultEcsTaskDefinitionNode(
                this,
                taskDefs.get(key)!,
                relativeExtensionPath => this.getExtensionAbsolutePath(relativeExtensionPath)
            )
        )
    }
}

export class DefaultEcsClusterNode extends AWSTreeErrorHandlerNode implements EcsClusterNode {

    public get regionCode(): string {
        return this.parent.regionCode
    }

    private readonly servicesNode: EcsServicesNode

    public constructor(
        public readonly parent: EcsClustersNode,
        public arn: string,
        private readonly getExtensionAbsolutePath: (relativeExtensionPath: string) => string
    ) {
        super('', vscode.TreeItemCollapsibleState.Collapsed)
        this.servicesNode = new DefaultEcsServicesNode(this, this.getExtensionAbsolutePath)
        // TODO: Get new icons
        // These currently display blank space
        this.iconPath = {
            dark: vscode.Uri.file(this.getExtensionAbsolutePath('resources/dark/ecsCluster.svg')),
            light: vscode.Uri.file(this.getExtensionAbsolutePath('resources/light/ecsCluster.svg')),
        }
        this.update(arn)
    }

    public update(arn: string) {
        this.arn = arn
        this.label = convertEcsArnToResourceName(arn)
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
    }

    public async getChildren() {
        await this.handleErrorProneOperation(
            async () => this.updateChildren(),
            'localized failure message here'
        )

        if (!!this.errorNode) {
            return [this.errorNode]
        }

        if (this.serviceNodes.size > 0) {
            return [...this.serviceNodes.values()]
            .sort((nodeA, nodeB) =>
                nodeA.arn.localeCompare(
                    nodeB.arn
                )
            )
        }

        return [
            new PlaceholderNode(
                this,
                'localized placeholder-no clusters'
            )
        ]
    }

    public async updateChildren() {
        const client: EcsClient = ext.toolkitClientBuilder.createEcsClient(this.regionCode)
        const services = await toMapAsync(
            asyncIterableIteratorFromAwsClient<string>(
                client.listServices(this.parent.arn),
                'localized waiting message'
            ),
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
        public arn: string,
        private readonly getExtensionAbsolutePath: (relativeExtensionPath: string) => string
    ) {
        super('')
        // TODO: Get new icons
        // These currently display blank space
        this.iconPath = {
            dark: vscode.Uri.file(this.getExtensionAbsolutePath('resources/dark/ecsService.svg')),
            light: vscode.Uri.file(this.getExtensionAbsolutePath('resources/light/ecsService.svg')),
        }
        this.update(arn)
    }

    public update(arn: string) {
        this.arn = arn
        this.label = convertEcsArnToResourceName(arn, this.parent.parent.label)
    }
}

export class DefaultEcsTaskDefinitionNode extends AWSTreeErrorHandlerNode implements EcsTaskDefinitionNode {

    public get regionCode(): string {
        return this.parent.regionCode
    }

    public constructor(
        public readonly parent: EcsTaskDefinitionsNode,
        public arn: string,
        private readonly getExtensionAbsolutePath: (relativeExtensionPath: string) => string
    ) {
        super('')
        // TODO: Get new icons
        // These currently display blank space
        this.iconPath = {
            dark: vscode.Uri.file(this.getExtensionAbsolutePath('resources/dark/ecsTaskDef.svg')),
            light: vscode.Uri.file(this.getExtensionAbsolutePath('resources/light/ecsTaskDef.svg')),
        }
        this.update(arn)
    }

    public update(arn: string) {
        this.arn = arn
        this.label = convertEcsArnToResourceName(arn)
    }
}

/**
 * Wrapper function to handle status bar updates and lifecycle while iterating through an AsyncIterable
 *
 * @param iterableFromClient AsyncIterable, often from a default AWS client
 * @param statusMessage Status bar message to display while iterating through iterator
 */
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

/**
 * Converts ECS ARNs into friendly names. All ECS ARNs have the same naming requirement:
 * Up to 255 letters (uppercase and lowercase), numbers, hyphens, and underscores are allowed.
 *
 * @param arn ARN to pull the resource name from
 * @param excluded Resource-level text to omit from the resource name.
 * Some ARNs are nested under another resource name (e.g. services and tasks can incorporate the parent cluster name)
 * See https://docs.aws.amazon.com/general/latest/gr/aws-arns-and-namespaces.html#arn-syntax-ecs for details
 */
function convertEcsArnToResourceName(arn: string, excluded?: string): string | undefined {
    const regex = excluded ?
        new RegExp(`\/(${excluded}\/){0,1}([a-zA-Z0-9-_]{1,255})`) : new RegExp('\/([a-zA-Z0-9-_]{1,255})')

    const regexedString = regex.exec(arn)
    if (regexedString) {
        // always return last capture group
        return (regexedString[regexedString.length - 1])
    }

    // resource name not found
    return undefined
}
