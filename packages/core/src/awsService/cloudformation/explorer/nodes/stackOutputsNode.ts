/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItemCollapsibleState, ThemeIcon, Command } from 'vscode'
import { AWSTreeNodeBase } from '../../../../shared/treeview/nodes/awsTreeNodeBase'

export class StackOutputsNode extends AWSTreeNodeBase {
    public constructor(private readonly stackName: string) {
        super('Outputs', TreeItemCollapsibleState.None)
        this.contextValue = 'stackOutputs'
        this.iconPath = new ThemeIcon('output')
        this.command = this.getCommand()
    }

    private getCommand(): Command {
        return {
            title: 'Show Stack Outputs',
            command: 'aws.cloudformation.stack.outputs.show',
            arguments: [this.stackName],
        }
    }
}
