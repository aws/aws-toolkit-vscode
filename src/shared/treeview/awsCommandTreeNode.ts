/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { TreeItemCollapsibleState } from 'vscode'
import { AWSTreeNodeBase } from '../treeview/awsTreeNodeBase'

export class AWSCommandTreeNode extends AWSTreeNodeBase {
    public readonly contextValue = 'awsCommandNode'

    public constructor(
        label: string,
        commandId: string,
        commandArguments?: any[],
        tooltip?: string,
    ) {
        super(label, TreeItemCollapsibleState.None)
        this.command = {
            title: label || '',
            command: commandId,
            arguments: commandArguments
        }
        this.tooltip = tooltip
    }
}
