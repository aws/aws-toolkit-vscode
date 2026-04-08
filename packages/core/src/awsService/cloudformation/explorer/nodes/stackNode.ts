/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItemCollapsibleState, ThemeIcon, ThemeColor } from 'vscode'
import { AWSTreeNodeBase } from '../../../../shared/treeview/nodes/awsTreeNodeBase'
import { StackSummary } from '@aws-sdk/client-cloudformation'
import { StackChangeSetsNode } from './stackChangeSetsNode'
import { ChangeSetsManager } from '../../stacks/changeSetsManager'

export class StackNode extends AWSTreeNodeBase {
    public constructor(
        public readonly stack: StackSummary,
        private readonly changeSetsManager: ChangeSetsManager
    ) {
        super(stack.StackName ?? 'Unknown Stack', TreeItemCollapsibleState.Collapsed)
        this.contextValue = 'stack'
        this.tooltip = `${stack.StackName} [${stack.StackStatus}]`
        this.iconPath = this.getStackIcon(stack.StackStatus)
    }

    private getStackIcon(status?: string): ThemeIcon {
        if (!status) {
            return new ThemeIcon('layers')
        }

        if (status.includes('COMPLETE') && !status.includes('ROLLBACK')) {
            return new ThemeIcon('check', new ThemeColor('charts.green'))
        } else if (status.includes('FAILED') || status.includes('ROLLBACK')) {
            return new ThemeIcon('error', new ThemeColor('charts.red'))
        } else if (status.includes('PROGRESS')) {
            return new ThemeIcon('sync~spin', new ThemeColor('charts.yellow'))
        } else {
            return new ThemeIcon('layers')
        }
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        const stackName = this.stack.StackName ?? ''

        await this.changeSetsManager.getChangeSets(stackName)

        return [new StackChangeSetsNode(stackName, this.changeSetsManager)]
    }
}
