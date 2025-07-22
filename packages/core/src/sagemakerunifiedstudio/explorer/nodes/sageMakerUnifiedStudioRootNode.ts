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
