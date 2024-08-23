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

/** An AWS Explorer node representing a DocumentDB resource. */
export abstract class DBResourceNode extends AWSTreeNodeBase implements AWSResourceNode {
    public override readonly regionCode: string
    public abstract readonly arn: string
    public abstract readonly name: string

    protected constructor(
        public readonly client: DocumentDBClient,
        label: string,
        collapsibleState?: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState)
        this.regionCode = client.regionCode
    }

    public [inspect.custom](): string {
        return 'DBResourceNode'
    }

    public abstract get status(): string | undefined

    public abstract getStatus(): Promise<string | undefined>

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
                return status !== currentStatus
            },
            { timeout: 30000, interval: 500, truthy: true }
        )

        return false
    }

    public async listTags() {
        return await this.client.listResourceTags(this.arn)
    }

    public abstract copyEndpoint(): Promise<void>

    public abstract getConsoleUrl(): vscode.Uri

    public openInBrowser() {
        return vscode.env.openExternal(this.getConsoleUrl())
    }
}
