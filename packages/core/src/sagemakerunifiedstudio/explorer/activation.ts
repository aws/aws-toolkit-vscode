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
// import { Commands } from '../../shared/vscode/commands2'

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

        vscode.commands.registerCommand('aws.smus.projectView', async (rootNode?: any) => {
            return await selectSMUSProject(rootNode)
        }),

        // Dispose DataZoneClient when extension is deactivated
        { dispose: () => DataZoneClient.dispose() }
    )
}
