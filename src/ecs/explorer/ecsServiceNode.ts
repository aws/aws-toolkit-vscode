/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ECS } from 'aws-sdk'
import { EcsClient } from '../../shared/clients/ecsClient'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { ErrorNode } from '../../shared/treeview/nodes/errorNode'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../shared/treeview/treeNodeUtilities'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { EcsClusterNode } from './ecsClusterNode'
import { EcsContainerNode } from './ecsContainerNode'

export class EcsServiceNode extends AWSTreeNodeBase implements AWSResourceNode {
    public constructor(
        public readonly service: ECS.Service,
        public readonly parent: EcsClusterNode,
        private readonly ecs: EcsClient
    ) {
        super(service.serviceName!, vscode.TreeItemCollapsibleState.Collapsed)
        this.tooltip = `(Service) ${service.serviceArn}`
        this.contextValue = 'awsEcsService'
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                const containerNames = await this.ecs.listContainerNames(this.service.taskDefinition!)

                return containerNames.map(name => new EcsContainerNode(name, this.name, this.parent.arn, this.ecs))
            },
            getErrorNode: async (error: Error, logID: number) => new ErrorNode(this, error, logID),
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
