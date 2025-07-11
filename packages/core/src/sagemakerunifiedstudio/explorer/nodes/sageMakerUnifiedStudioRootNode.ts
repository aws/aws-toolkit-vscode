/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'
import { getIcon } from '../../../shared/icons'
import { getLogger } from '../../../shared/logger/logger'
import { DataZoneClient } from '../../shared/client/datazoneClient'
import { SageMakerUnifiedStudioProjectNode } from './sageMakerUnifiedStudioProjectNode'
import { Commands } from '../../../shared/vscode/commands2'
import { telemetry } from '../../../shared/telemetry/telemetry'

const contextValueSmusRoot = 'sageMakerUnifiedStudioRoot'
const contextValueSmusNoProject = 'sageMakerUnifiedStudioNoProject'
const contextValueSmusErrorProject = 'sageMakerUnifiedStudioErrorProject'

/**
 * Command to retry loading projects when there's an error
 */
export const retrySmusProjectsCommand = Commands.declare('aws.smus.retryProjects', () => async () => {
    const logger = getLogger()
    try {
        // Force a refresh of the tree view
        const treeDataProvider = vscode.extensions
            .getExtension('amazonwebservices.aws-toolkit-vscode')
            ?.exports?.getTreeDataProvider?.('aws.smus.projectsView')
        if (treeDataProvider) {
            // If we can get the tree data provider, refresh it
            treeDataProvider.refresh?.()
        } else {
            // Otherwise, try to use the command that's registered in activation.ts
            try {
                await vscode.commands.executeCommand('aws.smus.projectsView.refresh')
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

/**
 * Root node for the SAGEMAKER UNIFIED STUDIO tree view
 */
export class SageMakerUnifiedStudioRootNode implements TreeNode {
    public readonly id = 'sageMakerUnifiedStudio'
    public readonly resource = this
    private readonly logger = getLogger()

    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChangeTreeItem = this.onDidChangeEmitter.event
    public readonly onDidChangeChildren = this.onDidChangeEmitter.event

    constructor() {}

    public refresh(): void {
        this.onDidChangeEmitter.fire()
    }

    public async getChildren(): Promise<TreeNode[]> {
        try {
            // Get the DataZone client singleton instance
            const datazoneClient = DataZoneClient.getInstance()
            const domainId = datazoneClient.getDomainId()

            // List all projects in the domain with pagination
            const allProjects = []
            let nextToken: string | undefined

            do {
                const result = await datazoneClient.listProjects({
                    domainId,
                    nextToken,
                    maxResults: 50,
                })
                allProjects.push(...result.projects)
                nextToken = result.nextToken
            } while (nextToken)

            const projects = allProjects

            if (projects.length === 0) {
                return [
                    {
                        id: 'sageMakerUnifiedStudioNoProject',
                        resource: {},
                        getTreeItem: () => {
                            const item = new vscode.TreeItem('No projects found', vscode.TreeItemCollapsibleState.None)
                            item.contextValue = contextValueSmusNoProject
                            return item
                        },
                        getParent: () => undefined,
                    },
                ]
            }

            // Create a tree node for each project
            return projects.map(
                (project) =>
                    new SageMakerUnifiedStudioProjectNode(`sageMakerUnifiedStudioProject-${project.id}`, project)
            )
        } catch (err) {
            this.logger.error('Failed to get SMUS projects: %s', (err as Error).message)

            return [
                {
                    id: 'sageMakerUnifiedStudioErrorProject',
                    resource: {},
                    getTreeItem: () => {
                        const item = new vscode.TreeItem('Error loading projects', vscode.TreeItemCollapsibleState.None)
                        item.tooltip = (err as Error).message
                        item.contextValue = contextValueSmusErrorProject

                        // Use the standalone retry command that doesn't require any arguments
                        item.command = {
                            command: 'aws.smus.retryProjects',
                            title: 'Retry Loading Projects',
                        }

                        // Add a retry icon and modify the label to indicate retry action is available
                        item.iconPath = new vscode.ThemeIcon('refresh')
                        item.label = 'Error loading projects (click to retry)'

                        return item
                    },
                    getParent: () => this,
                },
            ]
        }
    }

    public getTreeItem(): vscode.TreeItem {
        const item = new vscode.TreeItem('SageMaker Unified Studio', vscode.TreeItemCollapsibleState.Expanded)
        item.contextValue = contextValueSmusRoot
        item.iconPath = getIcon('vscode-database')

        return item
    }
}
