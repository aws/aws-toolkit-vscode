/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { inspect } from 'util'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { DocumentDBClient } from '../../shared/clients/docdbClient'
import { waitUntil } from '../../shared/utilities/timeoutUtils'
import { getLogger } from '../../shared/logger/logger'
import { PollingSet } from '../../shared/utilities/pollingSet'

/** An AWS Explorer node representing a DocumentDB resource. */
export abstract class DBResourceNode extends AWSTreeNodeBase implements AWSResourceNode {
    public override readonly regionCode: string
    public abstract readonly arn: string
    public abstract readonly name: string
    public readonly pollingSet: PollingSet<string> = new PollingSet(30000, this.updateNodeStatus.bind(this))
    private static readonly globalPollingArns: Set<string> = new Set<string>()
    public processingStatuses = new Set<string>([
        'creating',
        'modifying',
        'rebooting',
        'starting',
        'stopping',
        'renaming',
    ])

    protected constructor(
        public readonly client: DocumentDBClient,
        label: string,
        collapsibleState?: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState)
        this.regionCode = client.regionCode
        getLogger().debug(`NEW DBResourceNode`)
    }

    public isStatusRequiringPolling(): boolean {
        const currentStatus = this.status?.toLowerCase()
        const isProcessingStatus = currentStatus !== undefined && this.processingStatuses.has(currentStatus)
        getLogger().debug(
            `isStatusRequiringPolling (DBResourceNode):: Checking if status "${currentStatus}" for ARN: ${this.arn} requires polling: ${isProcessingStatus}`
        )
        return isProcessingStatus
    }

    public [inspect.custom](): string {
        return 'DBResourceNode'
    }

    public abstract get status(): string | undefined

    public abstract getStatus(): Promise<string | undefined>

    public abstract refreshTree(): void

    public abstract clearTimer(): void

    public get isAvailable(): boolean {
        return this.status === 'available'
    }

    public get isStopped(): boolean {
        return this.status === 'stopped'
    }

    public get isPolling(): boolean {
        const isPolling = DBResourceNode.globalPollingArns.has(this.arn)
        getLogger().debug(`isPolling: ARN ${this.arn} is ${isPolling ? '' : 'not '}being polled.`)
        return isPolling
    }

    public set isPolling(value: boolean) {
        if (value) {
            if (!this.isPolling) {
                DBResourceNode.globalPollingArns.add(this.arn)
                getLogger().info(`Polling started for ARN: ${this.arn}`)
            } else {
                getLogger().info(`Polling already active for ARN: ${this.arn}`)
            }
        } else {
            if (this.isPolling) {
                DBResourceNode.globalPollingArns.delete(this.arn)
                getLogger().info(`Polling stopped for ARN: ${this.arn}`)
            } else {
                getLogger().info(`Polling was not active for ARN: ${this.arn}`)
            }
        }
    }

    public async waitUntilStatusChanged(
        checkProcessingStatuses: boolean = false,
        timeout: number = 1200000,
        interval: number = 5000
    ): Promise<boolean> {
        await waitUntil(
            async () => {
                const status = await this.getStatus()
                if (checkProcessingStatuses) {
                    const isProcessingStatus = status !== undefined && this.processingStatuses.has(status.toLowerCase())
                    getLogger().debug('docdb: waitUntilStatusChangedToProcessingStatus: %O', isProcessingStatus)
                    return isProcessingStatus
                } else {
                    const hasStatusChanged = status !== this.status
                    getLogger().debug('docdb: waitUntilStatusChanged (status): %O', hasStatusChanged)
                    return hasStatusChanged
                }
            },
            { timeout, interval, truthy: true }
        )
        this.refreshTree()
        return false
    }

    public async trackChangesWithWaitProcessingStatus() {
        getLogger().debug(
            `Preparing to track changes with waiting a processing status for ARN: ${this.arn}; condition: ${this.isPolling};`
        )
        if (!this.isPolling) {
            this.isPolling = true
            await this.waitUntilStatusChanged(true, 60000, 1000)
            getLogger().debug(`Tracking changes for a processing status wait is over`)
            this.pollingSet.add(this.arn)
            getLogger().debug(`Tracking changes for ARN: ${this.arn}; condition: ${this.isPolling};`)
        } else {
            getLogger().debug(`ARN: ${this.arn} already being tracked`)
        }
    }

    public trackChanges() {
        getLogger().debug(`Preparing to track immediately for ARN: ${this.arn}; condition: ${this.isPolling};`)
        if (!this.isPolling) {
            this.isPolling = true
            this.pollingSet.add(this.arn)
            getLogger().debug(`Tracking changes for ARN: ${this.arn}; condition: ${this.isPolling};`)
        } else {
            getLogger().debug(`ARN: ${this.arn} already being tracked`)
        }
    }

    public async listTags() {
        return await this.client.listResourceTags(this.arn)
    }

    public abstract copyEndpoint(): Promise<void>

    public abstract getConsoleUrl(): vscode.Uri

    public openInBrowser() {
        return vscode.env.openExternal(this.getConsoleUrl())
    }

    private async updateNodeStatus() {
        const currentStatus = this.status
        const newStatus = await this.getStatus()
        getLogger().debug(
            `docdb: ${this.arn} updateNodeStatus (new status): ${newStatus} (old status): ${currentStatus}`
        )
        if (currentStatus !== newStatus) {
            getLogger().info(`docdb: ${this.arn} status: ${newStatus}, refreshing UI`)
            this.refreshTree()
        }
        if (!this.isStatusRequiringPolling()) {
            getLogger().info(`docdb: ${this.arn} status: ${newStatus}, refreshing UI`)
            getLogger().debug(`pollingSet delete ${this.arn} updateNodeStatus`)
            this.pollingSet.delete(this.arn)
            this.pollingSet.clearTimer()
            this.isPolling = false
            this.refreshTree()
        }
    }
}
