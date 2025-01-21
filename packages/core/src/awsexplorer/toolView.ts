/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ResourceTreeDataProvider, TreeNode } from '../shared/treeview/resourceTreeDataProvider'

export interface ToolView {
    nodes: TreeNode[]
    view: string
    refreshCommands: ((provider: ResourceTreeDataProvider) => void)[]
}

/**
 * The 'local' explorer is represented as 'Developer Tools' in the UI. We use a different name within
 * source code to differentiate between _Toolkit developers_ and _Toolkit users_.
 *
 * Components placed under this view do not strictly need to be 'local'. They just need to place greater
 * emphasis on the developer's local development environment.
 */
export function createToolView(viewNode: ToolView): vscode.TreeView<TreeNode> {
    const treeDataProvider = new ResourceTreeDataProvider({ getChildren: () => getChildren(viewNode.nodes) })
    for (const refreshCommand of viewNode.refreshCommands ?? []) {
        refreshCommand(treeDataProvider)
    }

    return vscode.window.createTreeView(viewNode.view, { treeDataProvider })
}

async function getChildren(roots: TreeNode[]) {
    const nodes: TreeNode[] = []

    for (const node of roots) {
        if (node.getChildren) {
            nodes.push(...(await node.getChildren()))
        }
    }

    return nodes
}
