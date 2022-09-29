/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { EcsClient } from '../../shared/clients/ecsClient'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { EcsServiceNode } from './ecsServiceNode'
import { getIcon } from '../../shared/icons'

const CONTEXT_EXEC_ENABLED = 'awsEcsContainerNodeExecEnabled'
const CONTEXT_EXEC_DISABLED = 'awsEcsContainerNodeExecDisabled'
const TASK_STATUS_RUNNING = 'RUNNING'

export class EcsContainerNode extends AWSTreeNodeBase {
    public readonly ecs: EcsClient

    public constructor(
        public readonly containerName: string,
        public readonly parent: EcsServiceNode,
        public readonly taskRoleArn: string | undefined
    ) {
        super(containerName)
        this.ecs = this.parent.ecs
        this.tooltip = containerName
        this.contextValue = this.parent.service.enableExecuteCommand ? CONTEXT_EXEC_ENABLED : CONTEXT_EXEC_DISABLED

        this.iconPath = getIcon('aws-ecs-container')
    }

    public describeTasks(tasks: string[]) {
        return this.ecs.describeTasks(this.parent.service.clusterArn!, tasks)
    }

    private async hasRunningTasks(): Promise<boolean> {
        return (
            (
                await this.ecs.listTasks({
                    cluster: this.parent.service.clusterArn,
                    serviceName: this.parent.service.serviceName,
                    desiredStatus: TASK_STATUS_RUNNING,
                    maxResults: 1,
                })
            ).length > 0
        )
    }

    public async updateNodeDescription(): Promise<void> {
        this.description = (await this.hasRunningTasks())
            ? false
            : localize('AWS.explorerNode.ecs.noRunningTasks', '[no running tasks]')
    }
}
