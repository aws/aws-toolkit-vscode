/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { TreeNode } from '../../../../shared/treeview/resourceTreeDataProvider'
import { localize } from '../../../../shared/utilities/vsCodeUtils'

/**
 * Create Open Walkthrough Node in App builder sidebar
 *
 */
export class WalkthroughNode implements TreeNode {
    public readonly id = 'walkthrough'
    public readonly resource: WalkthroughNode = this

    // Constructor left empty intentionally for future extensibility
    public constructor() {}

    /**
     * Generates the TreeItem for the Walkthrough Node.
     * This item will appear in the sidebar with a label and command to open the walkthrough.
     */
    public getTreeItem() {
        const itemLabel = localize('AWS.appBuilder.openWalkthroughTitle', 'Walkthrough of Application Builder')

        const item = new vscode.TreeItem(itemLabel)
        item.contextValue = 'awsWalkthroughNode'
        item.command = {
            title: localize('AWS.appBuilder.openWalkthroughTitle', 'Walkthrough of Application Builder'),
            command: 'aws.toolkit.lambda.openWalkthrough',
        }

        return item
    }
}
