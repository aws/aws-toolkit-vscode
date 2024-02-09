/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { ECS } from 'aws-sdk'
import { DefaultEcsClient } from '../shared/clients/ecsClient'
import { ResourceTreeNode } from '../shared/treeview/resource'
import { getIcon } from '../shared/icons'
import { AsyncCollection } from '../shared/utilities/asyncCollection'
import { prepareCommand } from './util'

function createValidTaskFilter(containerName: string) {
    return function (t: ECS.Task): t is ECS.Task & { taskArn: string } {
        const managed = !!t.containers?.find(
            c => c?.name === containerName && c.managedAgents?.find(a => a.name === 'ExecuteCommandAgent')
        )

        return t.taskArn !== undefined && managed
    }
}

interface ContainerDescription extends ECS.ContainerDefinition {
    readonly clusterArn: string
    readonly taskRoleArn: string
    readonly enableExecuteCommand?: boolean
}

export class Container {
    public readonly id = this.description.name!

    public constructor(
        private readonly client: DefaultEcsClient,
        public readonly serviceName: string,
        public readonly description: ContainerDescription
    ) {}

    public async listTasks() {
        const resp = await this.client.listTasks({
            cluster: this.description.clusterArn,
            serviceName: this.serviceName,
        })
        const tasks = await this.client.describeTasks(this.description.clusterArn, resp)

        return tasks.filter(createValidTaskFilter(this.description.name!))
    }

    public prepareCommandForTask(command: string, task: string) {
        return prepareCommand(this.client, command, this.description.taskRoleArn, {
            task,
            container: this.description.name!,
            cluster: this.description.clusterArn,
        })
    }

    public getTreeItem() {
        const item = new vscode.TreeItem(this.description.name!)

        return Object.assign(item, {
            iconPath: getIcon('aws-ecs-container'),
            contextValue: this.description.enableExecuteCommand
                ? 'awsEcsContainerNodeExecEnabled'
                : 'awsEcsContainerNodeExecDisabled',
        })
    }

    public toTreeNode(): ResourceTreeNode<this> {
        return new ResourceTreeNode(this)
    }
}

export class Service {
    public readonly id = this.description.serviceArn!
    public readonly arn = this.description.serviceArn!

    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChangeTreeItem = this.onDidChangeEmitter.event

    public constructor(private readonly client: DefaultEcsClient, public readonly description: ECS.Service) {}

    public async listContainers(): Promise<Container[]> {
        const definition = await this.getDefinition()
        const containers = definition.containerDefinitions ?? []

        return containers.map(
            c =>
                new Container(this.client, this.description.serviceName!, {
                    ...c,
                    enableExecuteCommand: this.description.enableExecuteCommand,
                    taskRoleArn: definition.taskRoleArn!,
                    clusterArn: this.description.clusterArn!,
                })
        )
    }

    public async getDefinition() {
        if (!this.description.taskDefinition) {
            throw new Error(`No task definition found for ECS service ${this.id}`)
        }

        const resp = await this.client.describeTaskDefinition(this.description.taskDefinition!)

        return resp.taskDefinition!
    }

    public getTreeItem() {
        const item = new vscode.TreeItem(this.description.serviceName!)
        item.description = this.description.status
        item.iconPath = getIcon('aws-ecs-service')
        item.tooltip = `${this.description.serviceArn}\nTask Definition: ${this.description.taskDefinition}`
        item.contextValue = this.description.enableExecuteCommand
            ? 'awsEcsServiceNode.ENABLED'
            : 'awsEcsServiceNode.DISABLED'

        return item
    }

    public async toggleExecuteCommand() {
        await this.client.updateService({
            cluster: this.description.clusterArn!,
            service: this.description.serviceName!,
            forceNewDeployment: true,
            enableExecuteCommand: !this.description.enableExecuteCommand,
        })

        this.description.enableExecuteCommand = !this.description.enableExecuteCommand
        this.onDidChangeEmitter.fire()
    }

    public toTreeNode(): ResourceTreeNode<this, Container> {
        return new ResourceTreeNode(this, {
            placeholder: localize('AWS.explorerNode.ecs.noContainers', '[No Containers found]'),
            childrenProvider: {
                onDidChange: this.onDidChangeEmitter.event,
                listResources: async () => {
                    const containers = await this.listContainers()

                    return containers.map(c => c.toTreeNode())
                },
            },
        })
    }
}

export class Cluster {
    public readonly id = this.cluster.clusterArn!

    public constructor(private readonly client: DefaultEcsClient, private readonly cluster: ECS.Cluster) {}

    public listServices(): AsyncCollection<Service[]> {
        return this.client
            .listServices({ cluster: this.cluster.clusterArn! })
            .map(services => services.map(s => new Service(this.client, s)))
    }

    public getTreeItem() {
        const item = new vscode.TreeItem(this.cluster.clusterName!)
        item.tooltip = this.cluster.clusterArn!
        item.iconPath = getIcon('aws-ecs-cluster')
        item.contextValue = 'awsEcsClusterNode'

        return item
    }

    public toTreeNode(): ResourceTreeNode<this, Service> {
        return new ResourceTreeNode(this, {
            placeholder: localize('AWS.explorerNode.ecs.noContainers', '[No Containers found]'),
            childrenProvider: {
                paginated: true,
                listResources: () => this.listServices().map(services => services.map(s => s.toTreeNode())),
            },
        })
    }
}

class Ecs {
    public readonly id = 'ecs'
    public constructor(private readonly client: DefaultEcsClient) {}

    public getTreeItem() {
        const item = new vscode.TreeItem('ECS')
        item.contextValue = 'awsEcsNode'

        return item
    }

    public listClusters(): AsyncCollection<Cluster[]> {
        return this.client.listClusters().map(clusters => clusters.map(c => new Cluster(this.client, c)))
    }
}

export function getEcsRootNode(region: string) {
    const controller = new Ecs(new DefaultEcsClient(region))

    return new ResourceTreeNode(controller, {
        placeholder: localize('AWS.explorerNode.ecs.noClusters', '[No Clusters found]'),
        childrenProvider: {
            paginated: true,
            listResources: () => controller.listClusters().map(clusters => clusters.map(c => c.toTreeNode())),
        },
    })
}
