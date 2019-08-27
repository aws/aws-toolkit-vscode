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
import { EcsNode, EcsTaskDefinitionNode, EcsTaskDefinitionsNode } from './ecsNodeInterfaces'
import { DefaultEcsTaskDefinitionNode } from './ecsTaskDefinitionNode'

export class DefaultEcsTaskDefinitionsNode extends AWSTreeErrorHandlerNode implements EcsTaskDefinitionsNode {
    private readonly taskDefinitionNodes: Map<string, EcsTaskDefinitionNode>

    public constructor(
        public readonly parent: EcsNode,
        private readonly getExtensionAbsolutePath: (relativeExtensionPath: string) => string
    ) {
        super('Task Definitions', vscode.TreeItemCollapsibleState.Collapsed)
        this.taskDefinitionNodes = new Map<string, EcsTaskDefinitionNode>()
    }

    public get regionCode(): string {
        return this.parent.regionCode
    }

    public async getChildren(): Promise<(EcsTaskDefinitionNode | ErrorNode | PlaceholderNode)[]> {
        await this.handleErrorProneOperation(
            async () => this.updateChildren(),
            localize(
                'AWS.explorerNode.ecs.taskDef.error',
                'Error loading ECS clusters'
            )
        )

        if (!!this.errorNode) {
            return [this.errorNode]
        }

        if (this.taskDefinitionNodes.size > 0) {
            return [...this.taskDefinitionNodes.values()]
            .sort((nodeA, nodeB) =>
                nodeA.name.localeCompare(
                    nodeB.name
                )
            )
        }

        return [
            new PlaceholderNode(
                this,
                localize(
                    'AWS.explorerNode.ecs.taskDef.none',
                    'No task definitions found'
                )
            )
        ]
    }

    public async updateChildren(): Promise<void> {

        const taskDefs = await this.getEcsTaskDefinitions()

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

    protected async getEcsTaskDefinitions() {
        const client: EcsClient = ext.toolkitClientBuilder.createEcsClient(this.regionCode)

        return await toMapAsync(
            asyncIterableWithStatusBarUpdate<string>(
                client.listTaskDefinitionFamilies(),
                localize('AWS.explorerNode.ecs.taskDef.loading', 'Loading ECS task defintions...')
            ),
            cluster => cluster
        )
    }
}
