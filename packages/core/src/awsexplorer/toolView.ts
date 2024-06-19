/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ResourceTreeDataProvider, TreeNode } from '../shared/treeview/resourceTreeDataProvider'
import { isCloud9 } from '../shared/extensionUtilities'
import { debounce } from '../shared/utilities/functionUtils'

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
    const view = vscode.window.createTreeView(viewNode.view, { treeDataProvider })

    // Cloud9 will only refresh when refreshing the entire tree
    if (isCloud9()) {
        viewNode.nodes.forEach(node => {
            // Refreshes are delayed to guard against excessive calls to `getTreeItem` and `getChildren`
            // The 10ms delay is arbitrary. A single event loop may be good enough in many scenarios.
            const refresh = debounce(() => treeDataProvider.refresh(node), 10)
            node.onDidChangeTreeItem?.(() => refresh())
            node.onDidChangeChildren?.(() => refresh())
        })
    }

    return view
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
