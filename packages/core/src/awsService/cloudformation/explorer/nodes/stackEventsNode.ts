/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItemCollapsibleState, ThemeIcon, Command } from 'vscode'
import { AWSTreeNodeBase } from '../../../../shared/treeview/nodes/awsTreeNodeBase'
import { commandKey } from '../../utils'

export class StackEventsNode extends AWSTreeNodeBase {
    public constructor(stackName: string) {
        super('Events', TreeItemCollapsibleState.None)
        this.contextValue = 'stackEvents'
        this.iconPath = new ThemeIcon('history')
        this.command = {
            command: commandKey('stack.events.show'),
            title: 'Show Stack Events',
            arguments: [stackName],
        } as Command
    }
}
