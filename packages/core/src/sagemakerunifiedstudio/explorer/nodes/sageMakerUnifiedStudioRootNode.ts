/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'
import { getIcon } from '../../../shared/icons'
import { getLogger } from '../../../shared/logger/logger'
import { DataZoneClient, DataZoneProject } from '../../shared/client/datazoneClient'
import { Commands } from '../../../shared/vscode/commands2'
import { telemetry } from '../../../shared/telemetry/telemetry'
import { createQuickPick } from '../../../shared/ui/pickerPrompter'
import { SageMakerUnifiedStudioProjectNode } from './sageMakerUnifiedStudioProjectNode'
import { SageMakerUnifiedStudioAuthInfoNode } from './sageMakerUnifiedStudioAuthInfoNode'
import { SmusErrorCodes } from '../../shared/smusUtils'
import { SmusAuthenticationProvider } from '../../auth/providers/smusAuthenticationProvider'
import { ToolkitError } from '../../../../src/shared/errors'
import { recordAuthTelemetry } from '../../shared/telemetry'
import { SmusAuthenticationMethod } from '../../auth/ui/authenticationMethodSelection'
import { SmusAuthenticationOrchestrator } from '../../auth/authenticationOrchestrator'

const contextValueSmusRoot = 'sageMakerUnifiedStudioRoot'
const contextValueSmusLogin = 'sageMakerUnifiedStudioLogin'
const contextValueSmusLearnMore = 'sageMakerUnifiedStudioLearnMore'
const projectPickerTitle = 'Select a SageMaker Unified Studio project you want to open'
const projectPickerPlaceholder = 'Select project'

export class SageMakerUnifiedStudioRootNode implements TreeNode {
    public readonly id = 'smusRootNode'
    public readonly resource = this
    private readonly logger = getLogger()
    private readonly projectNode: SageMakerUnifiedStudioProjectNode
    private readonly authInfoNode: SageMakerUnifiedStudioAuthInfoNode
    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChangeTreeItem = this.onDidChangeEmitter.event
    public readonly onDidChangeChildren = this.onDidChangeEmitter.event

    public constructor(
        private readonly authProvider: SmusAuthenticationProvider,
        private readonly extensionContext: vscode.ExtensionContext
    ) {
        this.authInfoNode = new SageMakerUnifiedStudioAuthInfoNode(this)
        this.projectNode = new SageMakerUnifiedStudioProjectNode(this, this.authProvider, this.extensionContext)

        // Subscribe to auth provider connection changes to refresh the node
        this.authProvider.onDidChange(async () => {
            // Clear the project when connection changes
            await this.projectNode.clearProject()
            this.onDidChangeEmitter.fire()
            // Immediately refresh the tree view to show authenticated state
            try {
                await vscode.commands.executeCommand('aws.smus.rootView.refresh')
            } catch (refreshErr) {
                this.logger.debug(
                    `Failed to refresh views after connection state change: ${(refreshErr as Error).message}`
                )
            }
        })
    }

    public getTreeItem(): vscode.TreeItem {
        const item = new vscode.TreeItem('SageMaker Unified Studio', vscode.TreeItemCollapsibleState.Expanded)
        item.contextValue = contextValueSmusRoot
        item.iconPath = getIcon('vscode-database')

        // Set description based on authentication state
        if (!this.isAuthenticated()) {
            item.description = 'Not authenticated'
        } else {
            item.description = 'Connected'
        }

        return item
    }

    public async getChildren(): Promise<TreeNode[]> {
        const isAuthenticated = this.isAuthenticated()
        const hasExpiredConnection = this.hasExpiredConnection()

        this.logger.debug(
            `SMUS Root Node getChildren: isAuthenticated=${isAuthenticated}, hasExpiredConnection=${hasExpiredConnection}`
        )

        // Check for expired connection first
        if (hasExpiredConnection) {
            // Show auth info node with expired indication
            return [this.authInfoNode] // This will show expired connection info
        }

        // Check authentication state
        if (!isAuthenticated) {
            // Show login option and learn more link when not authenticated
            return [
                {
                    id: 'smusLogin',
                    resource: {},
                    getTreeItem: () => {
                        const item = new vscode.TreeItem('Sign in to get started', vscode.TreeItemCollapsibleState.None)
                        item.contextValue = contextValueSmusLogin
                        item.iconPath = getIcon('vscode-account')

                        // Set up the login command
                        item.command = {
                            command: 'aws.smus.login',
                            title: 'Sign in to SageMaker Unified Studio',
                        }

                        return item
                    },
                    getParent: () => this,
                },
                {
                    id: 'smusLearnMore',
                    resource: {},
                    getTreeItem: () => {
                        const item = new vscode.TreeItem(
                            'Learn more about SageMaker Unified Studio',
                            vscode.TreeItemCollapsibleState.None
                        )
                        item.contextValue = contextValueSmusLearnMore
                        item.iconPath = getIcon('vscode-question')

                        // Set up the learn more command
                        item.command = {
                            command: 'aws.smus.learnMore',
                            title: 'Learn more about SageMaker Unified Studio',
                        }

                        return item
                    },
                    getParent: () => this,
                },
            ]
        }

        // When authenticated, show auth info and projects
        return [this.authInfoNode, this.projectNode]
    }

    public getProjectSelectNode(): SageMakerUnifiedStudioProjectNode {
        return this.projectNode
    }

    public getAuthInfoNode(): SageMakerUnifiedStudioAuthInfoNode {
        return this.authInfoNode
    }

    public refresh(): void {
        this.onDidChangeEmitter.fire()
    }

    /**
     * Checks if the user has authenticated to SageMaker Unified Studio
     * This is validated by checking existing Connections for SMUS or resource metadata.
     */
    private isAuthenticated(): boolean {
        try {
            // Check if the connection is valid using the authentication provider
            const result = this.authProvider.isConnectionValid()
            this.logger.debug(`SMUS Root Node: Authentication check result: ${result}`)
            return result
        } catch (err) {
            this.logger.debug('Authentication check failed: %s', (err as Error).message)
            return false
        }
    }

    private hasExpiredConnection(): boolean {
        try {
            const activeConnection = this.authProvider.activeConnection
            const isConnectionValid = this.authProvider.isConnectionValid()

            this.logger.debug(
                `SMUS Root Node: activeConnection=${!!activeConnection}, isConnectionValid=${isConnectionValid}`
            )

            // Check if there's an active connection but it's expired/invalid
            const hasExpiredConnection = activeConnection && !isConnectionValid

            if (hasExpiredConnection) {
                this.logger.debug('SMUS Root Node: Connection is expired, showing reauthentication prompt')
                // Show reauthentication prompt to user
                void this.authProvider.showReauthenticationPrompt(activeConnection as any)
                return true
            }
            return false
        } catch (err) {
            this.logger.debug('Failed to check expired connection: %s', (err as Error).message)
            return false
        }
    }
}

/**
 * Command to open the SageMaker Unified Studio documentation
 */
export const smusLearnMoreCommand = Commands.declare('aws.smus.learnMore', () => async () => {
    const logger = getLogger()
    try {
        // Open the SageMaker Unified Studio documentation
        await vscode.env.openExternal(vscode.Uri.parse('https://aws.amazon.com/sagemaker/unified-studio/'))

        // Log telemetry
        telemetry.record({
            name: 'smus_learnMoreClicked',
            result: 'Succeeded',
            passive: false,
        })
    } catch (err) {
        logger.error('Failed to open SageMaker Unified Studio documentation: %s', (err as Error).message)

        // Log failure telemetry
        telemetry.record({
            name: 'smus_learnMoreClicked',
            result: 'Failed',
            passive: false,
        })
    }
})

/**
 * Command to login to SageMaker Unified Studio
 */
export const smusLoginCommand = Commands.declare('aws.smus.login', (context: vscode.ExtensionContext) => async () => {
    const logger = getLogger()
    return telemetry.smus_login.run(async (span) => {
        try {
            // Get the authentication provider instance
            const authProvider = SmusAuthenticationProvider.fromContext()

            // Import authentication method selection components
            const { SmusAuthenticationMethodSelector } = await import('../../auth/ui/authenticationMethodSelection.js')
            const { SmusAuthenticationPreferencesManager } = await import(
                '../../auth/preferences/authenticationPreferences.js'
            )

            // Check for preferred authentication method
            const preferredMethod = SmusAuthenticationPreferencesManager.getPreferredMethod(context)
            logger.debug(`SMUS Auth: Retrieved preferred method: ${preferredMethod}`)

            let selectedMethod: SmusAuthenticationMethod | undefined = preferredMethod
            let authCompleted = false

            // Main authentication loop - handles back navigation
            while (!authCompleted) {
                // Check if we should skip method selection (user has a remembered preference)
                if (selectedMethod) {
                    logger.debug(`SMUS Auth: Using authentication method: ${selectedMethod}`)
                } else {
                    // Show authentication method selection dialog
                    logger.debug('SMUS Auth: Showing authentication method selection dialog')
                    const methodSelection = await SmusAuthenticationMethodSelector.showAuthenticationMethodSelection()
                    selectedMethod = methodSelection.method
                }

                // Handle the selected authentication method
                logger.debug(`SMUS Auth: Processing authentication method: ${selectedMethod}`)
                if (selectedMethod === 'sso') {
                    // SSO Authentication - use SSO flow
                    const ssoResult = await SmusAuthenticationOrchestrator.handleSsoAuthentication(
                        authProvider,
                        span,
                        context
                    )

                    if (ssoResult === 'BACK') {
                        // User wants to go back to authentication method selection
                        selectedMethod = undefined // Reset to show method selection again
                        continue // Restart the loop
                    }

                    authCompleted = true
                } else {
                    // IAM Authentication - use new IAM profile selection flow
                    const iamResult = await SmusAuthenticationOrchestrator.handleIamAuthentication(
                        authProvider,
                        span,
                        context
                    )

                    if (iamResult === 'BACK') {
                        // User wants to go back to authentication method selection
                        selectedMethod = undefined // Reset to show method selection again
                        continue // Restart the loop
                    }

                    authCompleted = true
                }
            }
        } catch (err) {
            const isUserCancelled = err instanceof ToolkitError && err.code === SmusErrorCodes.UserCancelled
            if (!isUserCancelled) {
                void vscode.window.showErrorMessage(
                    `SageMaker Unified Studio: Failed to initiate login: ${(err as Error).message}`
                )
                logger.error('Failed to initiate login: %s', (err as Error).message)
            }
            throw err
        }
    })
})

/**
 * Command to sign out from SageMaker Unified Studio
 */
export const smusSignOutCommand = Commands.declare(
    'aws.smus.signOut',
    (context: vscode.ExtensionContext) => async () => {
        const logger = getLogger()
        return telemetry.smus_signOut.run(async (span) => {
            try {
                // Get the authentication provider instance
                const authProvider = SmusAuthenticationProvider.fromContext()

                // Check if there's an active connection to sign out from
                if (!authProvider.isConnected()) {
                    void vscode.window.showInformationMessage(
                        'No active SageMaker Unified Studio connection to sign out from.'
                    )
                    return
                }

                // Get connection details for logging
                const activeConnection = authProvider.activeConnection
                const domainId = activeConnection?.domainId
                const region = activeConnection?.ssoRegion

                // Show status message
                vscode.window.setStatusBarMessage('Signing out from SageMaker Unified Studio...', 5000)
                await recordAuthTelemetry(span, authProvider, domainId, region)

                // Delete the connection (this will also invalidate tokens and clear cache)
                if (activeConnection) {
                    await authProvider.secondaryAuth.deleteConnection()
                    logger.info(`Signed out from SageMaker Unified Studio: ${domainId}`)

                    // Clear connection-specific preferences on sign out (but keep auth method preference)
                    const { SmusAuthenticationPreferencesManager } = await import(
                        '../../auth/preferences/authenticationPreferences.js'
                    )
                    await SmusAuthenticationPreferencesManager.clearConnectionPreferences(context)
                }

                // Show success message
                void vscode.window.showInformationMessage('Successfully signed out from SageMaker Unified Studio.')

                // Clear the status bar message
                vscode.window.setStatusBarMessage('Signed out from SageMaker Unified Studio', 3000)

                // Refresh the tree view to show the sign-in state
                try {
                    await vscode.commands.executeCommand('aws.smus.rootView.refresh')
                } catch (refreshErr) {
                    logger.debug(`Failed to refresh views after sign out: ${(refreshErr as Error).message}`)
                    throw new ToolkitError('Failed to refresh views after sign out.', {
                        cause: refreshErr as Error,
                        code: (refreshErr as Error).name,
                    })
                }
            } catch (err) {
                void vscode.window.showErrorMessage(
                    `SageMaker Unified Studio: Failed to sign out: ${(err as Error).message}`
                )
                logger.error('Failed to sign out: %s', (err as Error).message)

                // Log failure telemetry
                throw new ToolkitError('Failed to sign out.', {
                    cause: err as Error,
                    code: (err as Error).name,
                })
            }
        })
    }
)

function isAccessDenied(error: Error): boolean {
    return error.name.includes('AccessDenied')
}

function createProjectQuickPickItems(projects: DataZoneProject[]) {
    return projects
        .sort(
            (a, b) =>
                (b.updatedAt ? new Date(b.updatedAt).getTime() : 0) -
                (a.updatedAt ? new Date(a.updatedAt).getTime() : 0)
        )
        .filter((project) => project.name !== 'GenerativeAIModelGovernanceProject')
        .map((project) => ({
            label: project.name,
            detail: 'ID: ' + project.id,
            description: project.description,
            data: project,
        }))
}

async function showQuickPick(items: any[]) {
    const quickPick = createQuickPick(items, {
        title: projectPickerTitle,
        placeholder: projectPickerPlaceholder,
    })
    return await quickPick.prompt()
}

export async function selectSMUSProject(projectNode?: SageMakerUnifiedStudioProjectNode) {
    const logger = getLogger()

    return telemetry.smus_accessProject.run(async (span) => {
        try {
            const authProvider = SmusAuthenticationProvider.fromContext()
            if (!authProvider.activeConnection) {
                logger.error('No active connection to display project view')
                return
            }

            const client = await DataZoneClient.getInstance(authProvider)
            logger.debug('DataZone client instance obtained successfully')

            const allProjects = await client.fetchAllProjects()
            const items = createProjectQuickPickItems(allProjects)

            if (items.length === 0) {
                logger.info('No projects found in the domain')
                void vscode.window.showInformationMessage('No projects found in the domain')
                await showQuickPick([{ label: 'No projects found', detail: '', description: '', data: {} }])
                return
            }

            const selectedProject = await showQuickPick(items)
            const accountId = await authProvider.getDomainAccountId()
            span.record({
                smusDomainId: authProvider.getDomainId(),
                smusProjectId: (selectedProject as DataZoneProject).id as string | undefined,
                smusDomainRegion: authProvider.getDomainRegion(),
                smusDomainAccountId: accountId,
            })
            if (
                selectedProject &&
                typeof selectedProject === 'object' &&
                selectedProject !== null &&
                !('type' in selectedProject) &&
                projectNode
            ) {
                await projectNode.setProject(selectedProject)
                await vscode.commands.executeCommand('aws.smus.rootView.refresh')
            }

            return selectedProject
        } catch (err) {
            const error = err as Error

            if (isAccessDenied(error)) {
                await showQuickPick([
                    {
                        label: '$(error)',
                        description: "You don't have permissions to view projects. Please contact your administrator",
                    },
                ])
                return
            }

            logger.error('Failed to select project: %s', error.message)
            void vscode.window.showErrorMessage(`Failed to select project: ${error.message}`)
        }
    })
}
