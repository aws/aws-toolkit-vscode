/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 */

'use strict'

import { TreeItem, TreeItemCollapsibleState } from 'vscode'
import { AWSTreeNodeBase } from '../treeview/awsTreeNodeBase'

export class AWSCommandTreeNode extends AWSTreeNodeBase {

    constructor(
        public readonly label: string,
        public commandId: string,
        public tooltip?: string,
        public contextValue?: string,
    ) {
        super()
    }

    public getChildren(): Thenable<AWSTreeNodeBase[]> {
       return new Promise(resolve => resolve([]))
    }

    public getTreeItem(): TreeItem {
        const item = new TreeItem(`${this.label}`, TreeItemCollapsibleState.None)
        item.tooltip = this.tooltip
        item.contextValue = this.contextValue
        item.command = {
            title: this.label,
            command: this.commandId
        }

        return item
    }
}

