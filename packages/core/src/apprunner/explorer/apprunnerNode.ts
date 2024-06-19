/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { compareTreeItems, makeChildrenNodes } from '../../shared/treeview/utils'
import * as vscode from 'vscode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { AppRunnerServiceNode } from './apprunnerServiceNode'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import * as nls from 'vscode-nls'
import { AppRunnerClient } from '../../shared/clients/apprunnerClient'
import { getPaginatedAwsCallIter } from '../../shared/utilities/collectionUtils'
import { AppRunner } from 'aws-sdk'
import globals from '../../shared/extensionGlobals'

const localize = nls.loadMessageBundle()

const pollingInterval = 20000
export class AppRunnerNode extends AWSTreeNodeBase {
    private readonly serviceNodes: Map<AppRunner.ServiceId, AppRunnerServiceNode> = new Map()
    private readonly pollingNodes: Set<string> = new Set()
    private pollTimer?: NodeJS.Timeout

    public constructor(public override readonly regionCode: string, public readonly client: AppRunnerClient) {
        super('App Runner', vscode.TreeItemCollapsibleState.Collapsed)
        this.contextValue = 'awsAppRunnerNode'
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                await this.updateChildren()

                return [...this.serviceNodes.values()]
            },
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(
                    this,
                    localize('AWS.explorerNode.apprunner.noServices', '[No App Runner services found]')
                ),
            sort: (nodeA, nodeB) => compareTreeItems(nodeA, nodeB),
        })
    }

    private async getServiceSummaries(request: AppRunner.ListServicesRequest = {}): Promise<AppRunner.Service[]> {
        const iterator = getPaginatedAwsCallIter({
            awsCall: async request => await this.client.listServices(request),
            nextTokenNames: {
                request: 'NextToken',
                response: 'NextToken',
            },
            request,
        })

        const services: AppRunner.Service[] = []

        while (true) {
            const next = await iterator.next()

            next.value.ServiceSummaryList.forEach((summary: AppRunner.Service) => services.push(summary))

            if (next.done) {
                break
            }
        }

        return services
    }

    public async updateChildren(): Promise<void> {
        const serviceSummaries = await this.getServiceSummaries()
        const deletedNodeArns = new Set(this.serviceNodes.keys())

        await Promise.all(
            serviceSummaries.map(async summary => {
                if (this.serviceNodes.has(summary.ServiceArn)) {
                    this.serviceNodes.get(summary.ServiceArn)!.update(summary)
                    if (summary.Status !== 'OPERATION_IN_PROGRESS') {
                        this.pollingNodes.delete(summary.ServiceArn)
                        this.clearPollTimer()
                    }
                } else {
                    this.serviceNodes.set(summary.ServiceArn, new AppRunnerServiceNode(this, this.client, summary))
                }
                deletedNodeArns.delete(summary.ServiceArn)
            })
        )

        deletedNodeArns.forEach(this.deleteNode.bind(this))
    }

    private clearPollTimer(): void {
        if (this.pollingNodes.size === 0 && this.pollTimer) {
            globals.clock.clearInterval(this.pollTimer)
            this.pollTimer = undefined
        }
    }

    public startPolling(id: string): void {
        this.pollingNodes.add(id)
        this.pollTimer = this.pollTimer ?? globals.clock.setInterval(this.refresh.bind(this), pollingInterval)
    }

    public stopPolling(id: string): void {
        this.pollingNodes.delete(id)
        this.serviceNodes.get(id)?.refresh()
        this.clearPollTimer()
    }

    public deleteNode(id: string): void {
        this.serviceNodes.delete(id)
        this.pollingNodes.delete(id)
    }

    public async createService(request: AppRunner.CreateServiceRequest): Promise<void> {
        await this.client.createService(request)
        this.refresh()
    }
}
