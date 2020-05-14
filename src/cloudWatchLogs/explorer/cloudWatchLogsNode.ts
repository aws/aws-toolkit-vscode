/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { CloudWatchLogs } from 'aws-sdk'
import * as vscode from 'vscode'

import { listCloudWatchLogGroups } from '../utils'
import { CloudWatchLogsClient } from '../../shared/clients/cloudWatchLogsClient'
import { ext } from '../../shared/extensionGlobals'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { toMap, updateInPlace, toArrayAsync } from '../../shared/utilities/collectionUtils'
import { ErrorNode } from '../../shared/treeview/nodes/errorNode'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { makeChildrenNodes } from '../../shared/treeview/treeNodeUtilities'
import { LogGroupNode } from './logGroupNode'

export const CONTEXT_VALUE_CLOUDWATCH_LOG = 'awsCloudWatchLogNode'

export class CloudWatchLogsNode extends AWSTreeNodeBase {
    private readonly logGroupNodes: Map<string, LogGroupNode>

    public constructor(private readonly regionCode: string) {
        super('CloudWatch Logs', vscode.TreeItemCollapsibleState.Collapsed)
        this.logGroupNodes = new Map<string, LogGroupNode>()
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                await this.updateChildren()

                return [...this.logGroupNodes.values()]
            },
            getErrorNode: async (error: Error) =>
                new ErrorNode(
                    this,
                    error,
                    localize('AWS.explorerNode.cloudWatchLogs.noGroups', '[No Log Groups found]')
                ),
            getNoChildrenPlaceholderNode: async () =>
                new PlaceholderNode(
                    this,
                    localize('AWS.explorerNode.cloudWatchLogs.error', 'Error loading CloudWatch Logs resources')
                ),
            sort: (nodeA: LogGroupNode, nodeB: LogGroupNode) => nodeA.logGroupName.localeCompare(nodeB.logGroupName),
        })
    }

    public async updateChildren(): Promise<void> {
        const client: CloudWatchLogsClient = ext.toolkitClientBuilder.createCloudWatchLogsClient(this.regionCode)
        const logGroups: Map<string, CloudWatchLogs.LogGroup> = toMap(
            await toArrayAsync(listCloudWatchLogGroups(client)),
            configuration => configuration.logGroupName
        )

        updateInPlace(
            this.logGroupNodes,
            logGroups.keys(),
            key => this.logGroupNodes.get(key)!.update(logGroups.get(key)!),
            key => makeLogGroupNode(this, this.regionCode, logGroups.get(key)!)
        )
    }
}

function makeLogGroupNode(
    parent: AWSTreeNodeBase,
    regionCode: string,
    configuration: CloudWatchLogs.LogGroup
): LogGroupNode {
    const node = new LogGroupNode(parent, regionCode, configuration)
    node.contextValue = CONTEXT_VALUE_CLOUDWATCH_LOG

    return node
}
