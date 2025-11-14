/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'
import { getIcon } from '../../../shared/icons'
import { getLogger } from '../../../shared/logger/logger'
import { DataZoneProject, DataZoneClient } from '../../shared/client/datazoneClient'
import { Commands } from '../../../shared/vscode/commands2'
import { telemetry } from '../../../shared/telemetry/telemetry'
import { createQuickPick } from '../../../shared/ui/pickerPrompter'
import { SageMakerUnifiedStudioProjectNode } from './sageMakerUnifiedStudioProjectNode'
import { SageMakerUnifiedStudioAuthInfoNode } from './sageMakerUnifiedStudioAuthInfoNode'
import { SmusErrorCodes, SmusUtils } from '../../shared/smusUtils'
import { handleCredExpiredError } from '../../shared/credentialExpiryHandler'
import { SmusAuthenticationProvider } from '../../auth/providers/smusAuthenticationProvider'
import { ToolkitError } from '../../../../src/shared/errors'
import { SmusAuthenticationMethod } from '../../auth/ui/authenticationMethodSelection'
import { SmusAuthenticationOrchestrator } from '../../auth/authenticationOrchestrator'
import { isSmusSsoConnection, isSmusIamConnection } from '../../auth/model'
import { getContext } from '../../../shared/vscode/setContext'
import { createDZClientBaseOnDomainMode } from './utils'
import { DataZoneCustomClientHelper } from '../../shared/client/datazoneCustomClientHelper'

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

        // When authenticated, show auth info and projects (same for both IAM and non-IAM mode)
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
                this.logger.debug('SMUS Root Node: Connection is expired')
                // Only show reauthentication prompt for SSO connections, not IAM connections
                if (isSmusSsoConnection(activeConnection)) {
                    this.logger.debug('SMUS Root Node: Showing reauthentication prompt for SSO connection')
                    void this.authProvider.showReauthenticationPrompt(activeConnection)
                } else {
                    this.logger.debug('SMUS Root Node: Skipping reauthentication prompt for non-SSO connection')
                }
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

                    if (ssoResult.status === 'BACK') {
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

                    if (iamResult.status === 'BACK') {
                        // User wants to go back to authentication method selection
                        selectedMethod = undefined // Reset to show method selection again
                        continue // Restart the loop
                    }

                    if (iamResult.status === 'EDITING') {
                        // User is editing credentials, show helpful message with option to return to profile selection
                        const action = await vscode.window.showInformationMessage(
                            'Complete your AWS credential setup and try again, or return to profile selection.',
                            'Select Profile',
                            'Done'
                        )

                        if (action === 'Select Profile') {
                            // User wants to return to profile selection, continue the loop
                            continue
                        } else {
                            // User chose "Done" or dismissed, exit the authentication flow
                            throw new ToolkitError('User cancelled credential setup', {
                                code: SmusErrorCodes.UserCancelled,
                                cancelled: true,
                            })
                        }
                    }

                    if (iamResult.status === 'INVALID_PROFILE') {
                        // Profile validation failed, show error with option to select another profile
                        const action = await vscode.window.showErrorMessage(
                            `${iamResult.error}`,
                            'Select Another Profile',
                            'Cancel'
                        )

                        if (action === 'Select Another Profile') {
                            // User wants to select a different profile, continue the loop
                            continue
                        } else {
                            // User chose "Cancel" or dismissed, exit the authentication flow
                            throw new ToolkitError('User cancelled profile selection', {
                                code: SmusErrorCodes.UserCancelled,
                                cancelled: true,
                            })
                        }
                    }

                    authCompleted = true
                }
            }
        } catch (err) {
            const isUserCancelled = err instanceof ToolkitError && err.code === SmusErrorCodes.UserCancelled
            if (!isUserCancelled) {
                void vscode.window.showErrorMessage(`Failed to initiate login: ${(err as Error).message}`)
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
                const domainId = authProvider.getDomainId?.() || 'Unknown'

                // Sign out from SMUS (behavior depends on connection type)
                if (activeConnection) {
                    await authProvider.signOut()
                    logger.info(`Signed out from SageMaker Unified Studio: ${domainId}`)

                    // Clear connection-specific preferences on sign out (but keep auth method preference)
                    const { SmusAuthenticationPreferencesManager } = await import(
                        '../../auth/preferences/authenticationPreferences.js'
                    )
                    await SmusAuthenticationPreferencesManager.clearConnectionPreferences(context)
                }

                // Show success message
                void vscode.window.showInformationMessage('Successfully signed out from SageMaker Unified Studio.')

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

/**
 * Fetches projects filtered by IAM principal
 * For IAM users: filters by user profile using userIdentifier
 * For IAM role sessions: filters by group profile using groupIdentifier
 * @param authProvider The SMUS authentication provider
 * @param datazoneClient The DataZone client instance
 * @returns Promise resolving to filtered projects array
 * @throws Error if profile retrieval fails
 */
async function fetchProjectsByIamProfile(
    authProvider: SmusAuthenticationProvider,
    datazoneClient: DataZoneClient
): Promise<DataZoneProject[]> {
    const logger = getLogger()

    // Get credentials provider for IAM profile
    const activeConnection = authProvider.activeConnection
    if (!isSmusIamConnection(activeConnection)) {
        throw new Error('Active connection is not a valid IAM connection')
    }

    // Use cached caller identity ARN from auth provider
    const callerIdentityArn = await authProvider.getIamPrincipalArn()
    if (!callerIdentityArn) {
        throw new Error('Unable to retrieve caller identity ARN from cache')
    }

    // Determine if this is an IAM user or IAM role session using utility method
    const isIamUser = SmusUtils.isIamUserArn(callerIdentityArn)
    logger.debug(
        `Using cached caller identity ARN: ${callerIdentityArn}. Identity type: ${isIamUser ? 'IAM User' : 'IAM Role Session'}`
    )

    let projects: DataZoneProject[]

    if (isIamUser) {
        // IAM User flow - use GetUserProfile and filter by userIdentifier
        logger.debug('Using IAM user flow with GetUserProfile API')

        // Get user profile ID for the IAM user using DataZone client
        const userProfileId = await datazoneClient.getUserProfileIdForIamPrincipal(
            callerIdentityArn,
            authProvider.getDomainId()
        )
        logger.info(`Retrieved user profile ID: ${userProfileId} for IAM principal ${callerIdentityArn}`)

        // Fetch projects filtered by user profile
        projects = await datazoneClient.fetchAllProjects({ userIdentifier: userProfileId })
        logger.debug(`Fetched ${projects.length} projects for user profile ${userProfileId}`)
    } else {
        const credentialsProvider = await authProvider.getCredentialsProviderForIamProfile(activeConnection.profileName)
        const datazoneCustomClientHelper = DataZoneCustomClientHelper.getInstance(
            credentialsProvider,
            authProvider.getDomainRegion()
        )

        // IAM Role Session flow - use SearchGroupProfile and filter by groupIdentifier
        // The cached ARN needs conversion for role sessions
        const roleArn = SmusUtils.convertAssumedRoleArnToIamRoleArn(callerIdentityArn)
        logger.debug(`Using IAM role ARN: ${roleArn}`)

        // Get group profile ID for the current role
        const groupProfileId = await datazoneCustomClientHelper.getGroupProfileId(authProvider.getDomainId(), roleArn)
        logger.info(`Retrieved group profile ID: ${groupProfileId}`)

        // Fetch projects filtered by group profile
        projects = await datazoneClient.fetchAllProjects({ groupIdentifier: groupProfileId })
        logger.debug(`Fetched ${projects.length} projects for group profile ${groupProfileId}`)
    }

    return projects
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

            const datazoneClient = await createDZClientBaseOnDomainMode(authProvider)
            logger.debug('DataZone client instance obtained successfully')

            let allProjects: DataZoneProject[]

            if (getContext('aws.smus.isIamMode')) {
                // Filter projects by IAM profile (user or role session)
                try {
                    allProjects = await fetchProjectsByIamProfile(authProvider, datazoneClient)
                } catch (err) {
                    const error = err as Error

                    // Handle no profile found (user or group)
                    if (
                        error instanceof ToolkitError &&
                        (error.code === SmusErrorCodes.NoGroupProfileFound ||
                            error.code === SmusErrorCodes.NoUserProfileFound)
                    ) {
                        logger.error('No profile found for IAM principal: %s', error.message)

                        const principalArn = await authProvider.getIamPrincipalArn()
                        const arnSuffix = principalArn ? `: ${principalArn}` : ''
                        void vscode.window.showErrorMessage(
                            `No resources found for IAM principal${arnSuffix}. Ensure SageMaker Unified Studio resources exist for this IAM principal.`
                        )
                        return error
                    }

                    // Handle access denied
                    if (isAccessDenied(error)) {
                        logger.error('Access denied when retrieving profile: %s', error.message)
                        void vscode.window.showErrorMessage(
                            "You don't have permissions to access this resource. Please contact your administrator"
                        )
                        return error
                    }

                    // Handle other errors
                    logger.error('Failed to retrieve profile information: %s', error.message)
                    void vscode.window.showErrorMessage('Failed to fetch IAM principal information. Try again.')
                    return error
                }
            } else {
                // In non-IAM mode, fetch all projects without filtering
                allProjects = await datazoneClient.fetchAllProjects()
            }

            const items = createProjectQuickPickItems(allProjects)

            // Handle no projects scenario
            if (items.length === 0) {
                if (getContext('aws.smus.isIamMode')) {
                    logger.debug('No accessible projects found for IAM principal')
                    void vscode.window.showInformationMessage('No accessible projects found for your IAM principal')
                } else {
                    logger.debug('No projects found in the domain')
                    void vscode.window.showInformationMessage('No projects found in the domain')
                }
                return
            }

            // Show project picker
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

            // Handle access denied scenarios
            if (isAccessDenied(error)) {
                logger.error('Access denied when fetching projects: %s', error.message)
                await showQuickPick([
                    {
                        label: '$(error)',
                        description: "You don't have permissions to view projects. Please contact your administrator",
                    },
                ])
                return
            }

            // Handle network/API failures
            logger.error('Failed to select project: %s', error.message)
            void vscode.window.showErrorMessage(`Failed to select project: ${error.message}`)
            await handleCredExpiredError(err)
        }
    })
}
