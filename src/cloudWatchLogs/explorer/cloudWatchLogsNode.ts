/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { CloudWatchLogs } from 'aws-sdk'
import * as vscode from 'vscode'

import { CloudWatchLogsClient } from '../../shared/clients/cloudWatchLogsClient'
import { ext } from '../../shared/extensionGlobals'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { toMap, updateInPlace, toArrayAsync } from '../../shared/utilities/collectionUtils'
import { ErrorNode } from '../../shared/treeview/nodes/errorNode'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../shared/treeview/treeNodeUtilities'
import { LogGroupNode } from './logGroupNode'

export abstract class CloudWatchLogsBase extends AWSTreeNodeBase {
    protected readonly logGroupNodes: Map<string, LogGroupNode>

    public constructor(
        label: string,
        protected readonly regionCode: string,
        protected placeholderMessage: string = localize(
            'AWS.explorerNode.cloudWatchLogs.nologs',
            '[No log groups found]'
        )
    ) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed)
        this.logGroupNodes = new Map<string, LogGroupNode>()
    }

    protected abstract getLogGroups(client: CloudWatchLogsClient): Promise<Map<string, CloudWatchLogs.LogGroup>>

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                await this.updateChildren()

                return [...this.logGroupNodes.values()]
            },
            getErrorNode: async (error: Error, logID: number) => new ErrorNode(this, error, logID),
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(this, localize('AWS.explorerNode.cloudWatchLogs.placeholder', '[No Logs found]')),
            sort: (nodeA: LogGroupNode, nodeB: LogGroupNode) => nodeA.name.localeCompare(nodeB.name),
        })
    }

    public async updateChildren(): Promise<void> {
        const client: CloudWatchLogsClient = ext.toolkitClientBuilder.createCloudWatchLogsClient(this.regionCode)
        const logGroups = await this.getLogGroups(client)

        updateInPlace(
            this.logGroupNodes,
            logGroups.keys(),
            key => this.logGroupNodes.get(key)!.update(logGroups.get(key)!),
            key => new LogGroupNode(this, this.regionCode, logGroups.get(key)!)
        )
    }
}
export class CloudWatchLogsNode extends CloudWatchLogsBase {
    public constructor(regionCode: string) {
        super(
            'CloudWatch Logs',
            regionCode,
            localize('AWS.explorerNode.cloudWatchLogs.error', 'Error loading CloudWatch Logs resources')
        )
    }

    protected async getLogGroups(client: CloudWatchLogsClient): Promise<Map<string, CloudWatchLogs.LogGroup>> {
        return toMap(await toArrayAsync(client.describeLogGroups()), configuration => configuration.logGroupName)
    }
}
