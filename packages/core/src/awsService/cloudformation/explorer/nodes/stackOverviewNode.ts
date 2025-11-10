/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItemCollapsibleState, ThemeIcon } from 'vscode'
import { AWSTreeNodeBase } from '../../../../shared/treeview/nodes/awsTreeNodeBase'
import { StackSummary } from '@aws-sdk/client-cloudformation'
import { commandKey } from '../../utils'

export class StackOverviewNode extends AWSTreeNodeBase {
    public constructor(private readonly stack: StackSummary) {
        super('Overview', TreeItemCollapsibleState.None)
        this.contextValue = 'stackOverview'
        this.iconPath = new ThemeIcon('info')
        this.command = {
            title: 'Show Stack Overview',
            command: commandKey('api.showStackOverview'),
            arguments: [this.stack],
        }
    }
}
