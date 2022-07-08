/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as telemetry from '../shared/telemetry/telemetry'
import { cdkNode } from '../cdk/explorer/rootNode'
import { ResourceTreeDataProvider, TreeNode } from '../shared/treeview/resourceTreeDataProvider'
import { once } from '../shared/utilities/functionUtils'
import { AppNode } from '../cdk/explorer/nodes/appNode'
import { isCloud9 } from '../shared/extensionUtilities'
import { initNodes } from '../caws/explorer'
import { codewhispererNode } from '../codewhisperer/explorer/codewhispererNode'

export interface RootNode extends TreeNode {
    canShow?(): Promise<boolean> | boolean
    readonly onDidChangeVisibility?: vscode.Event<void>
}

const roots: RootNode[] = [cdkNode, codewhispererNode]

async function getChildren(roots: RootNode[]) {
    const nodes: TreeNode[] = []

    for (const node of roots) {
        if (!node.canShow || (await node.canShow())) {
            nodes.push(node)
        }
    }

    return nodes
}

/**
 * The 'local' explorer is represented as 'Developer Tools' in the UI. We use a different name within
 * source code to differentiate between _Toolkit developers_ and _Toolkit users_.
 *
 * Components placed under this view do not strictly need to be 'local'. They just need to place greater
 * emphasis on the developer's local development environment.
 */
export function createLocalExplorerView(ctx: vscode.ExtensionContext): vscode.TreeView<TreeNode> {
    // CAWS/Sono are special cases at the moment and need to be created after the extension activates
    // Will probably just add a `register` function to generalize this
    roots.unshift(...initNodes(ctx))

    const treeDataProvider = new ResourceTreeDataProvider({ getChildren: () => getChildren(roots) })
    const view = vscode.window.createTreeView('aws.developerTools', { treeDataProvider })

    roots.forEach(node => {
        node.onDidChangeVisibility?.(() => treeDataProvider.refresh())
    })

    // Legacy CDK metric, remove this when we add something generic
    const recordExpandCdkOnce = once(telemetry.recordCdkAppExpanded)
    view.onDidExpandElement(e => {
        if (e.element.resource instanceof AppNode) {
            recordExpandCdkOnce()
        }
    })

    // Legacy CDK behavior. Mostly useful for C9 as they do not have inline buttons.
    view.onDidChangeVisibility(({ visible }) => visible && cdkNode.refresh())

    // Cloud9 will only refresh when refreshing the entire tree
    if (isCloud9()) {
        roots.forEach(node => {
            node.onDidChangeChildren?.(() => treeDataProvider.refresh())
        })
    }

    return view
}
