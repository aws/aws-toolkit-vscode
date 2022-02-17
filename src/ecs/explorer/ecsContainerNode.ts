/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { EcsClient } from '../../shared/clients/ecsClient'
import globals from '../../shared/extensionGlobals'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { EcsServiceNode } from './ecsServiceNode'

const CONTEXT_EXEC_ENABLED = 'awsEcsContainerNodeExecEnabled'
const CONTEXT_EXEC_DISABLED = 'awsEcsContainerNodeExecDisabled'
const TASK_STATUS_RUNNING = 'RUNNING'

export class EcsContainerNode extends AWSTreeNodeBase {
    public constructor(
        public readonly containerName: string,
        public readonly serviceName: string,
        public readonly clusterArn: string,
        public readonly ecs: EcsClient,
        public readonly parent: EcsServiceNode
    ) {
        super(containerName)
        this.tooltip = containerName
        this.contextValue = this.parent.service.enableExecuteCommand ? CONTEXT_EXEC_ENABLED : CONTEXT_EXEC_DISABLED

        this.iconPath = {
            dark: vscode.Uri.file(globals.iconPaths.dark.container),
            light: vscode.Uri.file(globals.iconPaths.light.container),
        }
    }

    public listTasks() {
        return this.ecs.listTasks({ cluster: this.clusterArn, serviceName: this.serviceName })
    }

    public describeTasks(tasks: string[]) {
        return this.ecs.describeTasks(this.clusterArn, tasks)
    }

    private async hasRunningTasks(): Promise<boolean> {
        return (
            (
                await this.ecs.listTasks({
                    cluster: this.clusterArn,
                    serviceName: this.serviceName,
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
