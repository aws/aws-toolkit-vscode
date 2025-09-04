/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ResourceTreeDataProvider } from '../../shared/treeview/resourceTreeDataProvider'
import {
    smusLoginCommand,
    smusLearnMoreCommand,
    smusSignOutCommand,
    SageMakerUnifiedStudioRootNode,
    selectSMUSProject,
} from './nodes/sageMakerUnifiedStudioRootNode'
import { DataZoneClient } from '../shared/client/datazoneClient'
import { openRemoteConnect, stopSpace } from '../../awsService/sagemaker/commands'
import { SagemakerUnifiedStudioSpaceNode } from './nodes/sageMakerUnifiedStudioSpaceNode'
import { SageMakerUnifiedStudioProjectNode } from './nodes/sageMakerUnifiedStudioProjectNode'
import { getLogger } from '../../shared/logger/logger'
import { setSmusConnectedContext, SmusAuthenticationProvider } from '../auth/providers/smusAuthenticationProvider'
import { setupUserActivityMonitoring } from '../../awsService/sagemaker/sagemakerSpace'
import { telemetry } from '../../shared/telemetry/telemetry'
import { SageMakerUnifiedStudioSpacesParentNode } from './nodes/sageMakerUnifiedStudioSpacesParentNode'
import { isSageMaker } from '../../shared/extensionUtilities'

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
    const smusRootNode = new SageMakerUnifiedStudioRootNode(smusAuthProvider, extensionContext)
    const treeDataProvider = new ResourceTreeDataProvider({ getChildren: () => smusRootNode.getChildren() })

    // Register the tree view
    const treeView = vscode.window.createTreeView('aws.smus.rootView', { treeDataProvider })
    treeDataProvider.refresh()

    // Register the commands
    extensionContext.subscriptions.push(
        smusLoginCommand.register(),
        smusLearnMoreCommand.register(),
        smusSignOutCommand.register(),
        treeView,
        vscode.commands.registerCommand('aws.smus.rootView.refresh', () => {
            treeDataProvider.refresh()
        }),

        vscode.commands.registerCommand(
            'aws.smus.projectView',
            async (projectNode?: SageMakerUnifiedStudioProjectNode) => {
                return await selectSMUSProject(projectNode)
            }
        ),

        vscode.commands.registerCommand('aws.smus.refreshProject', async () => {
            const projectNode = smusRootNode.getProjectSelectNode()
            await projectNode.refreshNode()
        }),

        vscode.commands.registerCommand('aws.smus.switchProject', async () => {
            // Get the project node from the root node to ensure we're using the same instance
            const projectNode = smusRootNode.getProjectSelectNode()
            return await selectSMUSProject(projectNode)
        }),

        vscode.commands.registerCommand('aws.smus.stopSpace', async (node: SagemakerUnifiedStudioSpaceNode) => {
            if (!validateNode(node)) {
                return
            }
            await telemetry.smus_stopSpace.run(async (span) => {
                span.record({
                    smusSpaceKey: node.resource.DomainSpaceKey,
                    smusDomainRegion: node.resource.regionCode,
                    smusDomainId: (
                        node.resource.getParent() as SageMakerUnifiedStudioSpacesParentNode
                    )?.getAuthProvider()?.activeConnection?.domainId,
                    smusProjectId: (
                        node.resource.getParent() as SageMakerUnifiedStudioSpacesParentNode
                    )?.getProjectId(),
                })
                await stopSpace(node.resource, extensionContext, node.resource.sageMakerClient)
            })
        }),

        vscode.commands.registerCommand(
            'aws.smus.openRemoteConnection',
            async (node: SagemakerUnifiedStudioSpaceNode) => {
                if (!validateNode(node)) {
                    return
                }
                await telemetry.smus_startSpace.run(async (span) => {
                    span.record({
                        smusSpaceKey: node.resource.DomainSpaceKey,
                        smusDomainRegion: node.resource.regionCode,
                        smusDomainId: (
                            node.resource.getParent() as SageMakerUnifiedStudioSpacesParentNode
                        )?.getAuthProvider()?.activeConnection?.domainId,
                        smusProjectId: (
                            node.resource.getParent() as SageMakerUnifiedStudioSpacesParentNode
                        )?.getProjectId(),
                    })
                    await openRemoteConnect(node.resource, extensionContext, node.resource.sageMakerClient)
                })
            }
        ),

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

    // Track user activity for autoshutdown feature when in SageMaker Unified Studio environment
    if (isSageMaker('SMUS-SPACE-REMOTE-ACCESS')) {
        logger.info('SageMaker Unified Studio environment detected, setting up user activity monitoring')
        try {
            await setupUserActivityMonitoring(extensionContext)
        } catch (error) {
            logger.error(`Error in UserActivityMonitoring: ${error}`)
            throw error
        }
    } else {
        logger.info('Not in SageMaker Unified Studio remote environment, skipping user activity monitoring')
    }
}

/**
 * Checks if a node  is undefined and shows a warning message if so.
 */
function validateNode(node: SagemakerUnifiedStudioSpaceNode): boolean {
    if (!node) {
        void vscode.window.showWarningMessage('Space information is being refreshed. Please try again shortly.')
        return false
    }
    return true
}
