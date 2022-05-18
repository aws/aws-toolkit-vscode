/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { cdkNode } from '../cdk/explorer/rootNode'
import { ResourceTreeDataProvider, TreeNode } from '../shared/treeview/resourceTreeDataProvider'

export interface RootNode extends TreeNode {
    canShow?(): Promise<boolean> | boolean
    readonly onDidChangeVisibility?: vscode.Event<void>
}

const roots: readonly RootNode[] = [cdkNode]

async function getChildren() {
    const nodes: TreeNode[] = []

    for (const node of roots) {
        if (!node.canShow || (await node.canShow())) {
            nodes.push(node)
        }
    }

    return nodes
}

export function createDeveloperToolsView(): vscode.TreeView<TreeNode> {
    const treeDataProvider = new ResourceTreeDataProvider({ getChildren })
    const view = vscode.window.createTreeView('aws.developerTools', { treeDataProvider })

    roots.forEach(node => {
        node.onDidChangeVisibility?.(() => treeDataProvider.refresh())
    })

    return view
}
