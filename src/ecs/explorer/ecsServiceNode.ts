/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ECS } from 'aws-sdk'
import { EcsClient } from '../../shared/clients/ecsClient'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../shared/treeview/utils'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { EcsClusterNode } from './ecsClusterNode'
import { EcsContainerNode } from './ecsContainerNode'
import { getIcon } from '../../shared/icons'

const CONTEXT_EXEC_ENABLED = 'awsEcsServiceNode.ENABLED'
const CONTEXT_EXEC_DISABLED = 'awsEcsServiceNode.DISABLED'

export class EcsServiceNode extends AWSTreeNodeBase implements AWSResourceNode {
    public constructor(
        public readonly service: ECS.Service,
        public readonly parent: EcsClusterNode,
        public readonly ecs: EcsClient
    ) {
        super(service.serviceName!, vscode.TreeItemCollapsibleState.Collapsed)
        this.tooltip = `${service.serviceArn}\nTask Definition: ${service.taskDefinition}`
        this.contextValue = this.service.enableExecuteCommand ? CONTEXT_EXEC_ENABLED : CONTEXT_EXEC_DISABLED

        this.iconPath = getIcon('aws-ecs-service')
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                const taskDefinition = await this.ecs.describeTaskDefinition(this.service.taskDefinition!)
                const containers = taskDefinition.taskDefinition?.containerDefinitions
                if (!containers) {
                    return []
                }
                const childNodes = containers.map(
                    c => new EcsContainerNode(c.name!, this, taskDefinition.taskDefinition?.taskRoleArn)
                )

                const childPromises = []
                for (const node of childNodes) {
                    childPromises.push(node.updateNodeDescription())
                }
                await Promise.all(childPromises)
                return childNodes
            },
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.ecs.noContainers', '[No Containers found]')),
        })
    }

    public get arn(): string {
        return this.service.serviceArn!
    }

    public get name(): string {
        return this.service.serviceName!
    }
}
