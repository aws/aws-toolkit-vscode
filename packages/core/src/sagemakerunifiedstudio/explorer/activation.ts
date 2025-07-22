/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ResourceTreeDataProvider } from '../../shared/treeview/resourceTreeDataProvider'
import {
    retrySmusProjectsCommand,
    SageMakerUnifiedStudioRootNode,
    selectSMUSProject,
} from './nodes/sageMakerUnifiedStudioRootNode'
import { DataZoneClient } from '../shared/client/datazoneClient'

export async function activate(extensionContext: vscode.ExtensionContext): Promise<void> {
    // Create the SMUS projects tree view
    const smusRootNode = new SageMakerUnifiedStudioRootNode()
    const treeDataProvider = new ResourceTreeDataProvider({ getChildren: () => smusRootNode.getChildren() })

    // Register the tree view
    const treeView = vscode.window.createTreeView('aws.smus.rootView', { treeDataProvider })
    treeDataProvider.refresh()

    // Register the commands
    extensionContext.subscriptions.push(
        retrySmusProjectsCommand.register(),
        treeView,
        vscode.commands.registerCommand('aws.smus.rootView.refresh', () => {
            treeDataProvider.refresh()
        }),

        vscode.commands.registerCommand('aws.smus.projectView', async (projectNode?: any) => {
            return await selectSMUSProject(projectNode)
        }),

        vscode.commands.registerCommand('aws.smus.switchProject', async () => {
            // Get the project node from the root node to ensure we're using the same instance
            const projectNode = smusRootNode.getProjectSelectNode()
            return await selectSMUSProject(projectNode)
        }),

        // Dispose DataZoneClient when extension is deactivated
        { dispose: () => DataZoneClient.dispose() }
    )
}
