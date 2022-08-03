/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { CloudWatchLogs } from 'aws-sdk'
import * as vscode from 'vscode'

import { DefaultCloudWatchLogsClient } from '../../shared/clients/cloudWatchLogsClient'

import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { toMap, updateInPlace, toArrayAsync } from '../../shared/utilities/collectionUtils'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../shared/treeview/utils'
import { LogGroupNode } from './logGroupNode'

export const CONTEXT_VALUE_CLOUDWATCH_LOG_PARENT = 'awsCloudWatchLogParentNode'

export abstract class CloudWatchLogsBase extends AWSTreeNodeBase {
    protected readonly logGroupNodes: Map<string, LogGroupNode>
    protected abstract readonly placeholderMessage: string

    public constructor(
        label: string,
        public readonly regionCode: string,
        protected readonly cloudwatchClient: DefaultCloudWatchLogsClient
    ) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed)
        this.logGroupNodes = new Map<string, LogGroupNode>()
    }

    protected abstract getLogGroups(client: DefaultCloudWatchLogsClient): Promise<Map<string, CloudWatchLogs.LogGroup>>

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                await this.updateChildren()

                return [...this.logGroupNodes.values()]
            },
            getNoChildrenPlaceholderNode: async () => new PlaceholderNode(this, this.placeholderMessage),
            sort: (nodeA, nodeB) => nodeA.name.localeCompare(nodeB.name),
        })
    }

    public async updateChildren(): Promise<void> {
        const logGroups = await this.getLogGroups(this.cloudwatchClient)

        updateInPlace(
            this.logGroupNodes,
            logGroups.keys(),
            key => this.logGroupNodes.get(key)!.update(logGroups.get(key)!),
            key => new LogGroupNode(this.regionCode, logGroups.get(key)!)
        )
    }
}
export class CloudWatchLogsNode extends CloudWatchLogsBase {
    protected readonly placeholderMessage = localize('AWS.explorerNode.cloudWatchLogs.nologs', '[No log groups found]')

    public constructor(regionCode: string, client = new DefaultCloudWatchLogsClient(regionCode)) {
        super('CloudWatch Logs', regionCode, client)
        this.contextValue = CONTEXT_VALUE_CLOUDWATCH_LOG_PARENT
    }

    protected async getLogGroups(client: DefaultCloudWatchLogsClient): Promise<Map<string, CloudWatchLogs.LogGroup>> {
        return toMap(await toArrayAsync(client.describeLogGroups()), configuration => configuration.logGroupName)
    }
}
