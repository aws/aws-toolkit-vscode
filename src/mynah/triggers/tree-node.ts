/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { TreeNode } from '../../shared/treeview/resourceTreeDataProvider'
import { TriggerInteractionType } from '../telemetry/telemetry-metadata'

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
            arguments: [{ inputTrigger: TriggerInteractionType.TOOLKITS_MENU }],
        }
        return mynahTreeItem
    }
}
