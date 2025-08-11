/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ResourceTreeDataProvider } from '../../shared/treeview/resourceTreeDataProvider'
import {
    retrySmusProjectsCommand,
    smusLoginCommand,
    smusLearnMoreCommand,
    smusSignOutCommand,
    SageMakerUnifiedStudioRootNode,
    selectSMUSProject,
} from './nodes/sageMakerUnifiedStudioRootNode'
import { DataZoneClient } from '../shared/client/datazoneClient'
import { getLogger } from '../../shared/logger/logger'
import { setSmusConnectedContext, SmusAuthenticationProvider } from '../auth/providers/smusAuthenticationProvider'

export async function activate(extensionContext: vscode.ExtensionContext): Promise<void> {
    // Initialize the SMUS authentication provider
    const logger = getLogger()
    logger.debug('SMUS: Initializing authentication provider')
    // Create the auth provider instance (this will trigger restore() in the constructor)
    const smusAuthProvider = SmusAuthenticationProvider.fromContext()
    await smusAuthProvider.restore()
    // Set initial auth context after restore
    void setSmusConnectedContext(smusAuthProvider.isConnected())
    logger.debug('SMUS: Authentication provider initialized')

    // Create the SMUS projects tree view
    const smusRootNode = new SageMakerUnifiedStudioRootNode(smusAuthProvider)
    const treeDataProvider = new ResourceTreeDataProvider({ getChildren: () => smusRootNode.getChildren() })

    // Register the tree view
    const treeView = vscode.window.createTreeView('aws.smus.rootView', { treeDataProvider })
    treeDataProvider.refresh()

    // Register the commands
    extensionContext.subscriptions.push(
        smusLoginCommand.register(),
        smusLearnMoreCommand.register(),
        smusSignOutCommand.register(),
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

        vscode.commands.registerCommand('aws.smus.reauthenticate', async (connection?: any) => {
            if (connection) {
                try {
                    await smusAuthProvider.reauthenticate(connection)
                    // Refresh the tree view after successful reauthentication
                    treeDataProvider.refresh()
                    // Show success message
                    void vscode.window.showInformationMessage(
                        'Successfully reauthenticated with SageMaker Unified Studio'
                    )
                } catch (error) {
                    // Show error message if reauthentication fails
                    void vscode.window.showErrorMessage(`Failed to reauthenticate: ${error}`)
                    logger.error('SMUS: Reauthentication failed: %O', error)
                }
            }
        }),
        // Dispose DataZoneClient when extension is deactivated
        { dispose: () => DataZoneClient.dispose() }
    )
}
