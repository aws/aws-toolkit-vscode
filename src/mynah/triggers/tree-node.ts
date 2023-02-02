/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { TreeNode } from '../../shared/treeview/resourceTreeDataProvider'

export class MynahTreeNode implements TreeNode {
    public readonly id = 'Mynah'
    public readonly resource = this
    public readonly label = 'Mynah'

    constructor() {}

    public getTreeItem() {
        const mynahTreeItem = new vscode.TreeItem('Mynah', vscode.TreeItemCollapsibleState.None)
        mynahTreeItem.command = {
            title: 'Mynah',
            command: 'Mynah.show',
        }
        mynahTreeItem.contextValue = 'mynahTreeNodeNode'
        return mynahTreeItem
    }
}
