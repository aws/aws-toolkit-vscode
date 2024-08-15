/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { inspect } from 'util'
import { AWSResourceNode } from '../../shared/treeview/nodes/awsResourceNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { DocumentDBClient } from '../../shared/clients/docdbClient'

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

    public async listTags() {
        return await this.client.listResourceTags(this.arn)
    }

    public abstract copyEndpoint(): Promise<void>

    public abstract getConsoleUrl(): vscode.Uri

    public openInBrowser() {
        return vscode.env.openExternal(this.getConsoleUrl())
    }
}
