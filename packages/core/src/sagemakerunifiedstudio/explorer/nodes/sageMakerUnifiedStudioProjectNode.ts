/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'
import { getLogger } from '../../../shared/logger/logger'
import { telemetry } from '../../../shared/telemetry/telemetry'
import { AwsCredentialIdentity } from '@aws-sdk/types'
import { SageMakerUnifiedStudioDataNode } from './sageMakerUnifiedStudioDataNode'
import { DataZoneClient, DataZoneProject } from '../../shared/client/datazoneClient'
import { SageMakerUnifiedStudioRootNode } from './sageMakerUnifiedStudioRootNode'
import { SagemakerClient } from '../../../shared/clients/sagemaker'
import { SmusAuthenticationProvider } from '../../auth/providers/smusAuthenticationProvider'
import { SageMakerUnifiedStudioComputeNode } from './sageMakerUnifiedStudioComputeNode'
import { getIcon } from '../../../shared/icons'
import { SmusUtils } from '../../shared/smusUtils'
import { getResourceMetadata } from '../../shared/utils/resourceMetadataUtils'

/**
 * Tree node representing a SageMaker Unified Studio project
 */
export class SageMakerUnifiedStudioProjectNode implements TreeNode {
    public readonly id = 'smusProjectNode'
    public readonly resource = this
    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChangeTreeItem = this.onDidChangeEmitter.event
    public readonly onDidChangeChildren = this.onDidChangeEmitter.event
    public project?: DataZoneProject
    private logger = getLogger()
    private sagemakerClient?: SagemakerClient

    constructor(
        private readonly parent: SageMakerUnifiedStudioRootNode,
        private readonly authProvider: SmusAuthenticationProvider,
        private readonly extensionContext: vscode.ExtensionContext
    ) {
        // If we're in SMUS space environment, set project from resource metadata
        if (SmusUtils.isInSmusSpaceEnvironment()) {
            const resourceMetadata = getResourceMetadata()!
            if (resourceMetadata.AdditionalMetadata!.DataZoneProjectId) {
                this.project = {
                    id: resourceMetadata!.AdditionalMetadata!.DataZoneProjectId!,
                    name: 'Current Project',
                    domainId: resourceMetadata!.AdditionalMetadata!.DataZoneDomainId!,
                }
                // Fetch the actual project name asynchronously
                void this.fetchProjectName()
            }
        }
    }

    public async getTreeItem(): Promise<vscode.TreeItem> {
        if (this.project) {
            const item = new vscode.TreeItem('Project: ' + this.project.name, vscode.TreeItemCollapsibleState.Expanded)
            item.contextValue = 'smusSelectedProject'
            item.tooltip = `Project: ${this.project.name}\nID: ${this.project.id}`
            item.iconPath = getIcon('vscode-folder-opened')
            return item
        }

        const item = new vscode.TreeItem('Select a project', vscode.TreeItemCollapsibleState.None)
        item.contextValue = 'smusProjectSelectPicker'
        item.command = {
            command: 'aws.smus.projectView',
            title: 'Select Project',
            arguments: [this],
        }
        item.iconPath = getIcon('vscode-folder-opened')

        // Auto-invoke project selection after sign-in
        void vscode.commands.executeCommand('aws.smus.projectView', this)

        return item
    }

    public async getChildren(): Promise<TreeNode[]> {
        if (!this.project) {
            return []
        }
        try {
            telemetry.record({
                name: 'smus_selectProject',
                result: 'Succeeded',
                passive: false,
            })

            // Skip access check if we're in SMUS space environment (already in project space)
            if (!SmusUtils.isInSmusSpaceEnvironment()) {
                const hasAccess = await this.checkProjectAccess(this.project.id)
                if (!hasAccess) {
                    return [
                        {
                            id: 'smusProjectAccessDenied',
                            resource: {},
                            getTreeItem: () => {
                                const item = new vscode.TreeItem(
                                    'You are not a member of this project. Contact any of its owners to add you as a member.',
                                    vscode.TreeItemCollapsibleState.None
                                )
                                return item
                            },
                            getParent: () => this,
                        },
                    ]
                }
            }

            const dataNode = new SageMakerUnifiedStudioDataNode(this)

            // If we're in SMUS space environment, only show data node
            if (SmusUtils.isInSmusSpaceEnvironment()) {
                return [dataNode]
            }

            this.sagemakerClient = await this.initializeSagemakerClient(
                this.authProvider.activeConnection?.ssoRegion || 'us-east-1'
            )
            const computeNode = new SageMakerUnifiedStudioComputeNode(
                this,
                this.extensionContext,
                this.authProvider,
                this.sagemakerClient
            )
            return [dataNode, computeNode]
        } catch (err) {
            this.logger.error('Failed to select project: %s', (err as Error).message)
            throw err
        }
    }

    public getParent(): TreeNode | undefined {
        return this.parent
    }

    public async refreshNode(): Promise<void> {
        this.onDidChangeEmitter.fire()
    }

    public async setProject(project: any): Promise<void> {
        await this.cleanupProjectResources()
        this.project = project
    }

    public getProject(): DataZoneProject | undefined {
        return this.project
    }

    public async clearProject(): Promise<void> {
        await this.cleanupProjectResources()
        // Don't clear project if we're in SMUS space environment
        if (!SmusUtils.isInSmusSpaceEnvironment()) {
            this.project = undefined
        }
        await this.refreshNode()
    }

    private async cleanupProjectResources(): Promise<void> {
        await this.authProvider.invalidateAllProjectCredentialsInCache()
        if (this.sagemakerClient) {
            this.sagemakerClient.dispose()
            this.sagemakerClient = undefined
        }
    }

    private async checkProjectAccess(projectId: string): Promise<boolean> {
        try {
            const dzClient = await DataZoneClient.getInstance(this.authProvider)
            const userId = await dzClient.getUserId()
            if (!userId) {
                return false
            }
            const ssoUserProfileId = SmusUtils.extractSSOIdFromUserId(userId)
            const memberships = await dzClient.fetchAllProjectMemberships(projectId)
            const hasAccess = memberships.some((member) => member.memberDetails?.user?.userId === ssoUserProfileId)
            this.logger.debug(`Project access check for user ${ssoUserProfileId}: ${hasAccess}`)
            return hasAccess
        } catch (err) {
            this.logger.error('Failed to check project access: %s', (err as Error).message)
            return false
        }
    }

    private async fetchProjectName(): Promise<void> {
        if (!this.project || !SmusUtils.isInSmusSpaceEnvironment()) {
            return
        }

        try {
            const dzClient = await DataZoneClient.getInstance(this.authProvider)
            const projectDetails = await dzClient.getProject(this.project.id)

            if (projectDetails && projectDetails.name) {
                this.project.name = projectDetails.name
                // Refresh the tree item to show the updated name
                this.onDidChangeEmitter.fire()
            }
        } catch (err) {
            // No need to show error, this is just to dynamically show project name
            // If we fail to fetch project name, we will just show the default name
            this.logger.debug(`Failed to fetch project name: ${(err as Error).message}`)
        }
    }

    private async initializeSagemakerClient(regionCode: string): Promise<SagemakerClient> {
        if (!this.project) {
            throw new Error('No project selected for initializing SageMaker client')
        }
        const projectProvider = await this.authProvider.getProjectCredentialProvider(this.project.id)
        this.logger.info(`Successfully obtained project credentials provider for project ${this.project.id}`)
        const awsCredentialProvider = async (): Promise<AwsCredentialIdentity> => {
            return await projectProvider.getCredentials()
        }
        const sagemakerClient = new SagemakerClient(regionCode, awsCredentialProvider)
        return sagemakerClient
    }
}
