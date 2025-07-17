/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'

/**
 * Node representing the SageMaker Unified Studio region
 */
export class SageMakerUnifiedStudioRegionNode implements TreeNode {
    public readonly id = 'smusProjectRegionNode'
    public readonly resource = {}

    // TODO: Make this region dynamic based on the user's AWS configuration
    constructor(private readonly region: string = '<To be made dynamically>') {}

    public getTreeItem(): vscode.TreeItem {
        const item = new vscode.TreeItem(`Region: ${this.region}`, vscode.TreeItemCollapsibleState.None)
        item.contextValue = 'smusProjectRegion'
        item.iconPath = new vscode.ThemeIcon('location')
        return item
    }

    public getParent(): undefined {
        return undefined
    }
}
