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
import { EcsClusterNode, EcsServiceNode, EcsServicesNode } from './ecsNodeInterfaces'
import { DefaultEcsServiceNode } from './ecsServiceNode'

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

    public async getChildren(): Promise<(EcsServicesNode | ErrorNode | PlaceholderNode)[]>  {
        await this.handleErrorProneOperation(
            async () => this.updateChildren(),
            localize(
                'AWS.explorerNode.ecs.services.error',
                'Error loading ECS services for cluster {0}',
                this.parent.parent.label
            )
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
                localize(
                    'AWS.explorerNode.ecs.services.none',
                    'No services found for cluster {0}',
                    this.parent.parent.label
                )
            )
        ]
    }

    public async updateChildren() {
        const client: EcsClient = ext.toolkitClientBuilder.createEcsClient(this.regionCode)
        const services = await toMapAsync(
            asyncIterableWithStatusBarUpdate<string>(
                client.listServices(this.parent.arn),
                localize(
                    'AWS.explorerNode.ecs.services.loading',
                    'Loading ECS services for cluster {0}...',
                    this.parent.parent.label
                )
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
