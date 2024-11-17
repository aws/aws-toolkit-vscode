/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { inspect } from 'util'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { DocumentDBClient } from '../../shared/clients/docdbClient'
import { waitUntil } from '../../shared'
import { getLogger } from '../../shared/logger'
import { PollingSet } from '../../shared/utilities/pollingSet'

/** An AWS Explorer node representing a DocumentDB resource. */
export abstract class DBResourceNode extends AWSTreeNodeBase implements AWSResourceNode {
    public override readonly regionCode: string
    public abstract readonly arn: string
    public abstract readonly name: string
    public readonly pollingSet: PollingSet<string> = new PollingSet(10000, this.updateNodeStatus.bind(this))

    protected constructor(
        public readonly client: DocumentDBClient,
        label: string,
        collapsibleState?: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState)
        this.regionCode = client.regionCode
        getLogger().info(`NEW DBResourceNode`)
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

    public async waitUntilStatusChanged(): Promise<boolean> {
        const currentStatus = this.status

        await waitUntil(
            async () => {
                const status = await this.getStatus()
                getLogger().info('docdb: waitUntilStatusChanged (status): %O', status)
                return status !== currentStatus
            },
            { timeout: 1200000, interval: 5000, truthy: true }
        )

        return false
    }

    public trackChanges() {
        getLogger().info(
            `Preparing to track changes for ARN: ${this.arn}; pollingSet: ${this.pollingSet.has(this.arn)}; condition: ${this.pollingSet.has(this.arn) === false}`
        )
        if (this.pollingSet.has(this.arn) === false) {
            this.pollingSet.start(this.arn)
            getLogger().info(
                `Tracking changes for ARN: ${this.arn}; pollingSet: ${this.pollingSet.has(this.arn)}; condition: ${this.pollingSet.has(this.arn) === false}`
            )
        } else {
            getLogger().info(`ARN: ${this.arn} already being tracked`)
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
        getLogger().info(
            `docdb: ${this.arn} updateNodeStatus (new status): ${newStatus} (old status): ${currentStatus}`
        )
        if (currentStatus !== newStatus) {
            getLogger().info(`docdb: ${this.arn} updateNodeStatus - refreshing UI`)
            this.pollingSet.delete(this.arn)
            this.pollingSet.clearTimer()
            this.refreshTree()
        }
    }
}
