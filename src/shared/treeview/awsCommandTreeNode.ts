/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { TreeItem, TreeItemCollapsibleState } from 'vscode'
import { AWSTreeNodeBase } from '../treeview/awsTreeNodeBase'

export class AWSCommandTreeNode extends AWSTreeNodeBase {

    public constructor(
        public readonly label: string,
        public commandId: string,
        public commandArguments?: any[],
        public tooltip?: string,
        public contextValue?: string,
    ) {
        super()
    }

    public getChildren(): Thenable<AWSTreeNodeBase[]> {
        return Promise.resolve([])
    }

    public getTreeItem(): TreeItem {
        const item = new TreeItem(`${this.label}`, TreeItemCollapsibleState.None)
        item.tooltip = this.tooltip
        item.contextValue = this.contextValue
        item.command = {
            title: this.label,
            command: this.commandId,
            arguments: this.commandArguments,
        }

        return item
    }
}
