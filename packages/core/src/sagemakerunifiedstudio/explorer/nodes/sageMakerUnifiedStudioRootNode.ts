/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'
import { getIcon } from '../../../shared/icons'
import { getLogger } from '../../../shared/logger/logger'
import { DataZoneClient } from '../../shared/client/datazoneClient'
import { Commands } from '../../../shared/vscode/commands2'
import { telemetry } from '../../../shared/telemetry/telemetry'
import { createQuickPick } from '../../../shared/ui/pickerPrompter'
import { SageMakerUnifiedStudioProjectNode } from './sageMakerUnifiedStudioProjectNode'
import { SageMakerUnifiedStudioRegionNode } from './sageMakerUnifiedStudioRegionNode'

const contextValueSmusRoot = 'sageMakerUnifiedStudioRoot'

/**
 * Root node for the SAGEMAKER UNIFIED STUDIO tree view
 */
export class SageMakerUnifiedStudioRootNode implements TreeNode {
    public readonly id = 'smusRootNode'
    public readonly resource = this
    private readonly projectNode: SageMakerUnifiedStudioProjectNode
    private readonly projectRegionNode: SageMakerUnifiedStudioRegionNode

    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChangeTreeItem = this.onDidChangeEmitter.event
    public readonly onDidChangeChildren = this.onDidChangeEmitter.event

    constructor() {
        this.projectRegionNode = new SageMakerUnifiedStudioRegionNode()
        this.projectNode = new SageMakerUnifiedStudioProjectNode()
    }

    public getProjectSelectNode(): SageMakerUnifiedStudioProjectNode {
        return this.projectNode
    }

    public getProjectRegionNode(): SageMakerUnifiedStudioRegionNode {
        return this.projectRegionNode
    }

    public refresh(): void {
        this.onDidChangeEmitter.fire()
    }

    public async getChildren(): Promise<TreeNode[]> {
        return [this.projectRegionNode, this.projectNode]
    }

    public getTreeItem(): vscode.TreeItem {
        const item = new vscode.TreeItem('SageMaker Unified Studio', vscode.TreeItemCollapsibleState.Expanded)
        item.contextValue = contextValueSmusRoot
        item.iconPath = getIcon('vscode-database')

        return item
    }
}

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

export async function selectSMUSProject(
    selectNode?: SageMakerUnifiedStudioProjectNode,
    smusDomainId?: string,
    maxResults: number = 50
) {
    const logger = getLogger()
    getLogger().info('Listing SMUS projects in the domain')
    try {
        const datazoneClient = DataZoneClient.getInstance()
        const domainId = smusDomainId ? smusDomainId : datazoneClient.getDomainId()

        // List projects in the domain. Make this paginated in the follow up PR.
        const smusProjects = await datazoneClient.listProjects({
            domainId: domainId,
            maxResults: maxResults,
        })

        if (smusProjects.projects.length === 0) {
            void vscode.window.showInformationMessage('No projects found in the domain')
            return
        }
        const items = smusProjects.projects.map((project) => ({
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
        if (selectedProject && selectNode) {
            selectNode.setSelectedProject(selectedProject)
        }

        return selectedProject
    } catch (err) {
        logger.error('Failed to get SMUS projects: %s', (err as Error).message)
        void vscode.window.showErrorMessage(`Failed to load projects: ${(err as Error).message}`)
    }
}
