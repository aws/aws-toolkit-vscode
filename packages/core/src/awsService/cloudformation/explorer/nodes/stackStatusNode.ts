/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItemCollapsibleState, ThemeIcon, ThemeColor } from 'vscode'
import { AWSTreeNodeBase } from '../../../../shared/treeview/nodes/awsTreeNodeBase'

export class StackStatusNode extends AWSTreeNodeBase {
    public constructor(stackStatus: string) {
        super(stackStatus, TreeItemCollapsibleState.None)
        this.contextValue = 'stackStatus'
        this.iconPath = this.getStackIcon(stackStatus)
    }

    private getStackIcon(status: string): ThemeIcon {
        if (status.includes('COMPLETE') && !status.includes('ROLLBACK')) {
            return new ThemeIcon('check', new ThemeColor('charts.green'))
        } else if (status.includes('FAILED') || status.includes('ROLLBACK')) {
            return new ThemeIcon('error', new ThemeColor('charts.red'))
        } else if (status.includes('PROGRESS')) {
            return new ThemeIcon('sync~spin', new ThemeColor('charts.yellow'))
        } else {
            return new ThemeIcon('pulse')
        }
    }
}
