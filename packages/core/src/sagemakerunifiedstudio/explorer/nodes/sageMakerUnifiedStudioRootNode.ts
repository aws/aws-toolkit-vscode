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
import { SmusUtils } from '../../shared/smusUtils'
import { SmusAuthenticationProvider } from '../../auth/providers/smusAuthenticationProvider'
import { ToolkitError } from '../../../../src/shared/errors'
import { errorCode } from '../../shared/errors'

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
export const smusLoginCommand = Commands.declare('aws.smus.login', () => async () => {
    const logger = getLogger()
    return telemetry.smus_login.run(async (span) => {
        try {
            // Get DataZoneClient instance for URL validation

            // Show domain URL input dialog
            const domainUrl = await vscode.window.showInputBox({
                title: 'SageMaker Unified Studio Authentication',
                prompt: 'Enter your SageMaker Unified Studio Domain URL',
                placeHolder: 'https://<dzd_xxxxxxxxx>.sagemaker.<region>.on.aws',
                validateInput: (value) => SmusUtils.validateDomainUrl(value),
            })

            if (!domainUrl) {
                // User cancelled
                logger.debug('User cancelled domain URL input')
                return
            }

            // Show a simple status bar message instead of progress dialog
            vscode.window.setStatusBarMessage('Connecting to SageMaker Unified Studio...', 10000)

            try {
                // Get the authentication provider instance
                const authProvider = SmusAuthenticationProvider.fromContext()

                // Connect to SMUS using the authentication provider
                const connection = await authProvider.connectToSmus(domainUrl)

                if (!connection) {
                    throw new ToolkitError('Failed to establish connection', {
                        code: errorCode.failedAuthConnecton,
                    })
                }

                // Extract domain ID and region for logging
                const domainId = connection.domainId
                const region = connection.ssoRegion

                logger.info(`Connected to SageMaker Unified Studio domain: ${domainId} in region ${region}`)
                span.record({
                    smusDomainId: domainId,
                    awsRegion: region,
                })

                // Show success message
                void vscode.window.showInformationMessage(
                    `Successfully connected to SageMaker Unified Studio domain: ${domainId}`
                )

                // Clear the status bar message
                vscode.window.setStatusBarMessage('Connected to SageMaker Unified Studio', 3000)

                // Immediately refresh the tree view to show authenticated state
                try {
                    await vscode.commands.executeCommand('aws.smus.rootView.refresh')
                } catch (refreshErr) {
                    logger.debug(`Failed to refresh views after login: ${(refreshErr as Error).message}`)
                }
            } catch (connectionErr) {
                // Clear the status bar message
                vscode.window.setStatusBarMessage('Connection to SageMaker Unified Studio Failed')

                // Log the error and re-throw to be handled by the outer catch block
                logger.error('Connection failed: %s', (connectionErr as Error).message)
                throw new ToolkitError('Connection failed.', {
                    cause: connectionErr as Error,
                    code: (connectionErr as Error).name,
                })
            }
        } catch (err) {
            void vscode.window.showErrorMessage(
                `SageMaker Unified Studio: Failed to initiate login: ${(err as Error).message}`
            )
            logger.error('Failed to initiate login: %s', (err as Error).message)
            throw new ToolkitError('Failed to initiate login.', {
                cause: err as Error,
                code: (err as Error).name,
            })
        }
    })
})

/**
 * Command to sign out from SageMaker Unified Studio
 */
export const smusSignOutCommand = Commands.declare('aws.smus.signOut', () => async () => {
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

            span.record({
                smusDomainId: domainId,
                awsRegion: region,
            })

            // Delete the connection (this will also invalidate tokens and clear cache)
            if (activeConnection) {
                await authProvider.secondaryAuth.deleteConnection()
                logger.info(`Signed out from SageMaker Unified Studio${domainId}`)
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
})

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
            span.record({
                smusDomainId: authProvider.getDomainId(),
                smusProjectId: (selectedProject as DataZoneProject).id as string | undefined,
                smusDomainRegion: authProvider.getDomainRegion(),
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
