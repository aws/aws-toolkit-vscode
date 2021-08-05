/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as AsyncLock from 'async-lock'
import { AppRunnerClient } from '../../shared/clients/apprunnerClient'
import { AppRunner } from 'aws-sdk'
import { AppRunnerNode } from './apprunnerNode'
import { CloudWatchLogsClient } from '../../shared/clients/cloudWatchLogsClient'
import { ext } from '../../shared/extensionGlobals'
import { toArrayAsync, toMap } from '../../shared/utilities/collectionUtils'
import { CloudWatchLogsParentNode } from '../../cloudWatchLogs/explorer/cloudWatchLogsNode'
import { CloudWatchLogs } from 'aws-sdk'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

const CONTEXT_BASE = 'awsAppRunnerServiceNode'

const OPERATION_STATUS = {
    START_DEPLOYMENT: localize('AWS.apprunner.operationStatus.deploy', 'Deploying...'),
    CREATE_SERVICE: localize('AWS.apprunner.operationStatus.create', 'Creating...'),
    PAUSE_SERVICE: localize('AWS.apprunner.operationStatus.pause', 'Pausing...'),
    RESUME_SERVICE: localize('AWS.apprunner.operationStatus.resume', 'Resuming...'),
    DELETE_SERVICE: localize('AWS.apprunner.operationStatus.delete', 'Deleting...'),
    UPDATE_SERVICE: localize('AWS.apprunner.operationStatus.update', 'Updating...'),
}

type ServiceOperation = keyof typeof OPERATION_STATUS

export class AppRunnerServiceNode extends CloudWatchLogsParentNode implements AWSResourceNode {
    public readonly name: string
    public readonly arn: string // TODO: fix package.json
    private readonly lock: AsyncLock = new AsyncLock()

    constructor(
        public readonly parent: AppRunnerNode,
        private readonly client: AppRunnerClient,
        private info: AppRunner.Service,
        private currentOperation: AppRunner.OperationSummary & { Type?: ServiceOperation } = {}
    ) {
        super(
            'App Runner Service',
            parent.region,
            localize('AWS.explorerNode.apprunner.nologs', '[No App Runner logs found]')
        )
        this.iconPath = {
            dark: vscode.Uri.file(ext.iconPaths.dark.apprunner),
            light: vscode.Uri.file(ext.iconPaths.light.apprunner),
        }
        this.id = `AppRunnerService-${info.ServiceName}`
        this.name = info.ServiceName
        this.arn = info.ServiceArn

        this.update(info)
    }

    public getInfo(): AppRunner.Service {
        return this.info
    }

    public getUrl(): string {
        return `https://${this.info.ServiceUrl}`
    }

    protected async getLogGroups(client: CloudWatchLogsClient): Promise<Map<string, CloudWatchLogs.LogGroup>> {
        return toMap(
            await toArrayAsync(
                client.describeLogGroups({
                    logGroupNamePrefix: `/aws/apprunner/${this.info.ServiceName}/${this.info.ServiceId}`,
                })
            ),
            configuration => configuration.logGroupName
        )
    }

    private setLabel(): void {
        const displayStatus = this.currentOperation.Type
            ? OPERATION_STATUS[this.currentOperation.Type]
            : `${this.info.Status.charAt(0)}${this.info.Status.slice(1).toLowerCase().replace(/\_/g, ' ')}`
        this.label = `${this.info.ServiceName} [${displayStatus}]`
    }

    public update(info: AppRunner.ServiceSummary | AppRunner.Service): void {
        // update can be called multiple times during an event loop
        // this would rarely cause the node's status to appear as 'Operation in progress'
        this.lock.acquire(this.info.ServiceId, done => {
            const lastLabel = this.label
            this.updateInfo(info)
            this.updateStatus(lastLabel)
            done()
        })
    }

    private updateStatus(lastLabel?: string): void {
        if (this.label !== lastLabel && lastLabel !== 'App Runner Service') {
            this.refresh()
        }

        if (this.info.Status === 'DELETED') {
            this.parent.deleteNode(this.info.ServiceArn)
            this.parent.refresh()
        }

        if (this.info.Status === 'OPERATION_IN_PROGRESS') {
            this.parent.startPolling(this.info.ServiceArn)
        } else if (this.currentOperation.Type !== undefined) {
            this.currentOperation.Id = undefined
            this.currentOperation.Type = undefined
            this.setLabel()
            this.parent.stopPolling(this.info.ServiceArn)
        }
    }

    private async updateOperation(): Promise<void> {
        const operations = (await this.client.listOperations({ MaxResults: 1, ServiceArn: this.info.ServiceArn }))
            .OperationSummaryList
        const operation = operations && operations[0]?.EndedAt === undefined ? operations[0] : undefined
        if (operation !== undefined) {
            this.setOperation(this.info, operation.Id!, operation.Type as any)
        }
    }

    private updateInfo(info: AppRunner.ServiceSummary | AppRunner.Service): void {
        if (info.Status === 'OPERATION_IN_PROGRESS' && this.info.Status !== info.Status) {
            this.updateOperation()
        }

        this.info = Object.assign(this.info, info)
        this.contextValue = `${CONTEXT_BASE}.${this.info.Status}`
        this.setLabel()
    }

    public async pause(): Promise<void> {
        const resp = await this.client.pauseService({ ServiceArn: this.info.ServiceArn })
        this.setOperation(resp.Service, resp.OperationId, 'PAUSE_SERVICE')
    }

    public async resume(): Promise<void> {
        const resp = await this.client.resumeService({ ServiceArn: this.info.ServiceArn })
        this.setOperation(resp.Service, resp.OperationId, 'RESUME_SERVICE')
    }

    public async delete(): Promise<void> {
        const resp = await this.client.deleteService({ ServiceArn: this.info.ServiceArn })
        this.setOperation(resp.Service, resp.OperationId, 'DELETE_SERVICE')
    }

    public async updateService(request: AppRunner.UpdateServiceRequest): Promise<void> {
        const resp = await this.client.updateService({ ...request, ServiceArn: this.info.ServiceArn })
        this.setOperation(resp.Service, resp.OperationId, 'UPDATE_SERVICE')
    }

    public async deploy(): Promise<void> {
        const resp = await this.client.startDeployment({ ServiceArn: this.info.ServiceArn })
        this.setOperation(this.info, resp.OperationId, 'START_DEPLOYMENT')
    }

    public setOperation(info: AppRunner.Service, id?: string, type?: ServiceOperation): void {
        this.currentOperation.Id = id
        this.currentOperation.Type = type
        this.update(info)
    }

    public async describe(): Promise<AppRunner.Service> {
        const resp = await this.client.describeService({ ServiceArn: this.arn })
        this.update(resp.Service)
        return this.info
    }
}
