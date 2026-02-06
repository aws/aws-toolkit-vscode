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
import { openRemoteConnect, stopSpace } from '../../awsService/sagemaker/commands'
import { SagemakerUnifiedStudioSpaceNode } from './nodes/sageMakerUnifiedStudioSpaceNode'
import { SageMakerUnifiedStudioProjectNode } from './nodes/sageMakerUnifiedStudioProjectNode'
import { getLogger } from '../../shared/logger/logger'
import { setSmusConnectedContext, SmusAuthenticationProvider } from '../auth/providers/smusAuthenticationProvider'
import { isSmusIamConnection } from '../auth/model'
import { setupUserActivityMonitoring } from '../../awsService/sagemaker/sagemakerSpace'
import { telemetry } from '../../shared/telemetry/telemetry'
import { isSageMaker } from '../../shared/extensionUtilities'
import { recordSpaceTelemetry } from '../shared/telemetry'
import { DataZoneClient } from '../shared/client/datazoneClient'
import { handleCredExpiredError } from '../shared/credentialExpiryHandler'

export async function activate(extensionContext: vscode.ExtensionContext): Promise<void> {
    // Initialize the SMUS authentication provider
    const logger = getLogger('smus')
    logger.debug('Initializing authentication provider')
    // Create the auth provider instance (this will trigger restore() in the constructor)
    const smusAuthProvider = SmusAuthenticationProvider.fromContext()
    await smusAuthProvider.restore()
    // Set initial auth context after restore
    void setSmusConnectedContext(smusAuthProvider.isConnected())
    logger.debug('Authentication provider initialized')

    // Create the SMUS projects tree view
    const smusRootNode = new SageMakerUnifiedStudioRootNode(smusAuthProvider, extensionContext)
    const treeDataProvider = new ResourceTreeDataProvider({ getChildren: () => smusRootNode.getChildren() })

    // Register the tree view
    const treeView = vscode.window.createTreeView('aws.smus.rootView', { treeDataProvider })
    treeDataProvider.refresh()

    // Register the commands
    extensionContext.subscriptions.push(
        smusLoginCommand.register(extensionContext),
        smusLearnMoreCommand.register(),
        smusSignOutCommand.register(extensionContext),
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

        vscode.commands.registerCommand('aws.smus.refresh', async () => {
            treeDataProvider.refresh()
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
                try {
                    await recordSpaceTelemetry(span, node)
                    await stopSpace(node.resource, extensionContext, node.resource.sageMakerClient)
                } catch (err) {
                    await handleCredExpiredError(err)
                    throw err
                }
            })
        }),

        vscode.commands.registerCommand(
            'aws.smus.openRemoteConnection',
            async (node: SagemakerUnifiedStudioSpaceNode) => {
                if (!validateNode(node)) {
                    return
                }
                await telemetry.smus_openRemoteConnection.run(async (span) => {
                    try {
                        await recordSpaceTelemetry(span, node)
                        await openRemoteConnect(node.resource, extensionContext, node.resource.sageMakerClient)
                    } catch (err) {
                        await handleCredExpiredError(err)
                        throw err
                    }
                })
            }
        ),

        vscode.commands.registerCommand('aws.smus.reauthenticate', async (connection?: any) => {
            if (connection) {
                try {
                    await smusAuthProvider.reauthenticate(connection)
                    const projectNode = smusRootNode.getProjectSelectNode()
                    if (projectNode) {
                        const project = projectNode.getProject()
                        if (!project) {
                            await vscode.commands.executeCommand('aws.smus.switchProject')
                        }
                    }
                    treeDataProvider.refresh()

                    // IAM connections handle their own success messages
                    // Only show success message for SSO connections
                    if (!isSmusIamConnection(connection)) {
                        void vscode.window.showInformationMessage(
                            'Successfully reauthenticated with SageMaker Unified Studio'
                        )
                    }
                } catch (error) {
                    // Extract the most detailed error message available
                    let errorMessage = 'Unknown error'
                    if (error instanceof Error) {
                        // Check if this is a ToolkitError with a cause chain
                        const cause = (error as any).cause
                        if (cause instanceof Error) {
                            // Use the cause's message as it contains the detailed validation error
                            errorMessage = cause.message
                        } else {
                            // Fall back to the error's own message
                            errorMessage = error.message
                        }
                    }

                    // Show the detailed error message to the user
                    void vscode.window.showErrorMessage(`${errorMessage}`)
                    logger.error('Reauthentication failed: %O', error)
                }
            }
        }),
        // Dispose DataZoneClient when extension is deactivated
        { dispose: () => DataZoneClient.dispose() },
        // Dispose SMUS auth provider when extension is deactivated
        { dispose: () => smusAuthProvider.dispose() }
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
