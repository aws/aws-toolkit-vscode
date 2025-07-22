/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'
import { getIcon } from '../../../shared/icons'
import { getLogger } from '../../../shared/logger/logger'
import {
    DataZoneClient,
    setDefaultDatazoneDomainId,
    setDefaultDataZoneRegion,
} from '../../shared/client/datazoneClient'
import { Commands } from '../../../shared/vscode/commands2'
import { telemetry } from '../../../shared/telemetry/telemetry'
import { createQuickPick } from '../../../shared/ui/pickerPrompter'
import { SageMakerUnifiedStudioProjectNode } from './sageMakerUnifiedStudioProjectNode'
import { SageMakerUnifiedStudioAuthInfoNode } from './sageMakerUnifiedStudioAuthInfoNode'

const contextValueSmusRoot = 'sageMakerUnifiedStudioRoot'
const contextValueSmusLogin = 'sageMakerUnifiedStudioLogin'
const contextValueSmusLearnMore = 'sageMakerUnifiedStudioLearnMore'

/**
 * Root node for the SAGEMAKER UNIFIED STUDIO tree view
 */
export class SageMakerUnifiedStudioRootNode implements TreeNode {
    public readonly id = 'smusRootNode'
    public readonly resource = this
    private readonly projectNode: SageMakerUnifiedStudioProjectNode
    private readonly authInfoNode: SageMakerUnifiedStudioAuthInfoNode

    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChangeTreeItem = this.onDidChangeEmitter.event
    public readonly onDidChangeChildren = this.onDidChangeEmitter.event

    constructor() {
        this.authInfoNode = new SageMakerUnifiedStudioAuthInfoNode()
        this.projectNode = new SageMakerUnifiedStudioProjectNode()
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
     * Checks if the user is authenticated to SageMaker Unified Studio
     * Currently checks if domain ID is configured - will be enhanced in later tasks
     */
    private isAuthenticated(): boolean {
        try {
            const datazoneClient = DataZoneClient.getInstance()
            const domainId = datazoneClient.getDomainId()
            // For now, consider authenticated if domain ID is set
            // This will be replaced with proper authentication state detection in later tasks
            return Boolean(domainId && domainId.trim() !== '')
        } catch (err) {
            getLogger().debug('Authentication check failed: %s', (err as Error).message)
            return false
        }
    }

    public async getChildren(): Promise<TreeNode[]> {
        // Check authentication state first
        if (!this.isAuthenticated()) {
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

        return [this.authInfoNode, this.projectNode]
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
    try {
        // Show domain URL input dialog
        const domainUrl = await vscode.window.showInputBox({
            title: 'SageMaker Unified Studio Authentication',
            prompt: 'Enter your SageMaker Unified Studio Domain URL',
            placeHolder: 'https://<dzd_xxxxxxxxx>.sagemaker.<region>.on.aws',
            validateInput: validateDomainUrl,
        })

        if (!domainUrl) {
            // User cancelled
            logger.debug('User cancelled domain URL input')
            return
        }

        // Extract domain ID and region from the URL
        const { domainId, region } = extractDomainInfoFromUrl(domainUrl)

        if (!domainId) {
            void vscode.window.showErrorMessage('Failed to extract domain ID from URL')
            return
        }

        logger.info(`Setting domain ID to ${domainId} and region to ${region}`)

        // Set domain ID to simulate authentication
        setDefaultDatazoneDomainId(domainId)
        setDefaultDataZoneRegion(region)

        // Show success message
        void vscode.window.showInformationMessage(
            `Successfully connected to SageMaker Unified Studio domain: ${domainId} in region ${region}`
        )

        // Refresh the tree view to show authenticated state
        try {
            // Try to refresh the tree view using the command
            await vscode.commands.executeCommand('aws.smus.rootView.refresh')
        } catch (refreshErr) {
            logger.debug(`Failed to refresh views after login: ${(refreshErr as Error).message}`)
        }

        // Log telemetry
        telemetry.record({
            name: 'smus_loginAttempted',
            result: 'Succeeded',
            passive: false,
        })
    } catch (err) {
        void vscode.window.showErrorMessage(
            `SageMaker Unified Studio: Failed to initiate login: ${(err as Error).message}`
        )
        logger.error('Failed to initiate login: %s', (err as Error).message)

        // Log failure telemetry
        telemetry.record({
            name: 'smus_loginAttempted',
            result: 'Failed',
            passive: false,
        })
    }
})

/**
 * Command to retry loading projects when there's an error
 */
// TODO: Check if we need this command
export const retrySmusProjectsCommand = Commands.declare('aws.smus.retryProjects', () => async () => {
    const logger = getLogger()
    try {
        // Force a refresh of the tree view
        const treeDataProvider = vscode.extensions
            .getExtension('amazonwebservices.aws-toolkit-vscode')
            ?.exports?.getTreeDataProvider?.('aws.smus.rootView')
        if (treeDataProvider) {
            // If we can get the tree data provider, refresh it
            treeDataProvider.refresh?.()
        } else {
            // Otherwise, try to use the command that's registered in activation.ts
            try {
                await vscode.commands.executeCommand('aws.smus.rootView.refresh')
            } catch (cmdErr) {
                logger.debug(`Failed to execute refresh command: ${(cmdErr as Error).message}`)
            }
        }

        // Also trigger a command to refresh the explorer view
        await vscode.commands.executeCommand('aws.refreshAwsExplorer')

        // Log telemetry
        telemetry.record({
            name: 'smus_retryProjects',
            result: 'Succeeded',
            passive: false,
        })

        // Show a message to the user
        void vscode.window.showInformationMessage('Retrying to load SageMaker Unified Studio projects...')
    } catch (err) {
        void vscode.window.showErrorMessage(
            `SageMaker Unified Studio: Failed to retry loading projects: ${(err as Error).message}`
        )
        logger.error('Failed to retry loading projects: %s', (err as Error).message)
    }
})

export async function selectSMUSProject(projectNode?: SageMakerUnifiedStudioProjectNode, smusDomainId?: string) {
    const logger = getLogger()
    getLogger().info('Listing SMUS projects in the domain')
    try {
        const datazoneClient = DataZoneClient.getInstance()
        const domainId = smusDomainId ? smusDomainId : datazoneClient.getDomainId()

        // Fetching all projects in the specified domain as we have to sort them by updatedAt
        const smusProjects = await datazoneClient.fetchAllProjects({
            domainId: domainId,
        })

        if (smusProjects.length === 0) {
            void vscode.window.showInformationMessage('No projects found in the domain')
            return
        }
        // Process projects: sort by updatedAt, filter out current project, and map to quick pick items
        const items = [...smusProjects]
            .sort(
                (a, b) =>
                    (b.updatedAt ? new Date(b.updatedAt).getTime() : 0) -
                    (a.updatedAt ? new Date(a.updatedAt).getTime() : 0)
            )
            .filter((project) => !projectNode?.getProject() || project.id !== projectNode.getProject()?.id)
            .map((project) => ({
                label: project.name,
                detail: project.id,
                description: project.description,
                data: project,
            }))

        const quickPick = createQuickPick(items, {
            title: 'Select a SageMaker Unified Studio project you want to open',
            placeholder: 'Select project',
        })

        const selectedProject = await quickPick.prompt()
        if (selectedProject && projectNode) {
            projectNode.setProject(selectedProject)

            // Refresh the entire tree view
            await vscode.commands.executeCommand('aws.smus.rootView.refresh')
        }

        return selectedProject
    } catch (err) {
        logger.error('Failed to select project: %s', (err as Error).message)
        void vscode.window.showErrorMessage(`Failed to select project: ${(err as Error).message}`)
    }
}
/**
 * TODO : Move to helper/utils or auth credential provider.
 * Validates the domain URL format
 * @param value The URL to validate
 * @returns Error message if invalid, undefined if valid
 */
function validateDomainUrl(value: string): string | undefined {
    if (!value || value.trim() === '') {
        return 'Domain URL is required'
    }

    const trimmedValue = value.trim()

    // Check HTTPS requirement
    if (!trimmedValue.startsWith('https://')) {
        return 'Domain URL must use HTTPS (https://)'
    }

    // Check basic URL format
    try {
        const url = new URL(trimmedValue)

        // Check if it looks like a SageMaker Unified Studio domain
        if (!url.hostname.includes('sagemaker') || !url.hostname.includes('on.aws')) {
            return 'URL must be a valid SageMaker Unified Studio domain (e.g., https://dzd_xxxxxxxxx.sagemaker.us-east-1.on.aws)'
        }

        // Check for domain ID pattern in hostname
        const domainIdMatch = url.hostname.match(/^dzd[-_][a-zA-Z0-9_-]{1,36}/)
        if (!domainIdMatch) {
            return 'URL must contain a valid domain ID (starting with dzd- or dzd_)'
        }

        return undefined // Valid
    } catch (err) {
        return 'Invalid URL format'
    }
}

/**
 * TODO : Move to helper/utils or auth credential provider.
 * Extracts the domain ID and region from a SageMaker Unified Studio domain URL
 * @param domainUrl The domain URL
 * @returns Object containing domainId and region
 */
function extractDomainInfoFromUrl(domainUrl: string): { domainId: string; region: string } {
    try {
        const url = new URL(domainUrl.trim())

        // Extract domain ID (e.g., dzd_d3hr1nfjbtwui1 or dzd-d3hr1nfjbtwui1)
        const domainIdMatch = url.hostname.match(/^(dzd[-_][a-zA-Z0-9_-]{1,36})/)
        const domainId = domainIdMatch ? domainIdMatch[1] : ''
        // Extract region (e.g., us-east-2)
        const regionMatch = url.hostname.match(/sagemaker\.([-a-z0-9]+)\.on\.aws/)
        const region = regionMatch ? regionMatch[1] : 'us-east-1'

        return { domainId, region }
    } catch (err) {
        getLogger().debug('Failed to extract domain info from URL: %s', (err as Error).message)
        return { domainId: '', region: 'us-east-1' } // Return default values instead of empty object
    }
}
