/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ResourceTreeDataProvider } from '../../shared/treeview/resourceTreeDataProvider'
import { retrySmusProjectsCommand, SageMakerUnifiedStudioRootNode } from './nodes/sageMakerUnifiedStudioRootNode'

export async function activate(extensionContext: vscode.ExtensionContext): Promise<void> {
    // Create the SMUS projects tree view
    const smusRootNode = new SageMakerUnifiedStudioRootNode()
    const treeDataProvider = new ResourceTreeDataProvider({ getChildren: () => smusRootNode.getChildren() })

    // Register the tree view
    const treeView = vscode.window.createTreeView('aws.smus.projectsView', { treeDataProvider })
    treeDataProvider.refresh()

    // Register the refresh command
    extensionContext.subscriptions.push(
        retrySmusProjectsCommand.register(),
        treeView,
        vscode.commands.registerCommand('aws.smus.projectsView.refresh', () => {
            treeDataProvider.refresh()
        })
    )
}
