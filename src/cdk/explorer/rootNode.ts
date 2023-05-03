/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { TreeNode } from '../../shared/treeview/resourceTreeDataProvider'
import { createPlaceholderItem } from '../../shared/treeview/utils'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { detectCdkProjects } from './detectCdkProjects'
import { AppNode } from './nodes/appNode'

export async function getAppNodes(): Promise<TreeNode[]> {
    const appsFound = await detectCdkProjects(vscode.workspace.workspaceFolders)

    if (appsFound.length === 0) {
        return [createPlaceholderItem(localize('AWS.cdk.explorerNode.noApps', '[No CDK Apps found in Workspaces]'))]
    }

    return appsFound.map(appLocation => new AppNode(appLocation)).sort((a, b) => a.label.localeCompare(b.label) ?? 0)
}

export class CdkRootNode implements TreeNode {
    public readonly id = 'cdk'
    public readonly resource = this
    private readonly onDidChangeChildrenEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChangeChildren = this.onDidChangeChildrenEmitter.event

    public getChildren() {
        return getAppNodes()
    }

    public refresh(): void {
        this.onDidChangeChildrenEmitter.fire()
    }

    public getTreeItem() {
        const item = new vscode.TreeItem('CDK')
        item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed
        item.contextValue = 'awsCdkRootNode'

        return item
    }
}
