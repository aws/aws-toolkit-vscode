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
import { getResourceMetadata } from '../../shared/utils/resourceMetadataUtils'
import { getContext } from '../../../shared/vscode/setContext'
import { ToolkitError } from '../../../shared/errors'
import { SmusErrorCodes } from '../../shared/smusUtils'

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
    private hasShownFirstTimeMessage = false
    private isFirstTimeSelection = false

    constructor(
        private readonly parent: SageMakerUnifiedStudioRootNode,
        private readonly authProvider: SmusAuthenticationProvider,
        private readonly extensionContext: vscode.ExtensionContext
    ) {
        // If we're in SMUS space environment, set project from resource metadata
        if (getContext('aws.smus.inSmusSpaceEnvironment')) {
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

        const item = new vscode.TreeItem('Select a project', vscode.TreeItemCollapsibleState.Expanded)
        item.contextValue = 'smusProjectSelectPicker'
        item.command = {
            command: 'aws.smus.projectView',
            title: 'Select Project',
            arguments: [this],
        }
        item.iconPath = getIcon('vscode-folder-opened')

        return item
    }

    public async getChildren(): Promise<TreeNode[]> {
        if (!this.project) {
            return []
        }

        return telemetry.smus_renderProjectChildrenNode.run(async (span) => {
            try {
                const isInSmusSpace = getContext('aws.smus.inSmusSpaceEnvironment')
                const accountId = await this.authProvider.getDomainAccountId()
                span.record({
                    smusToolkitEnv: isInSmusSpace ? 'smus_space' : 'local',
                    smusDomainId: this.project?.domainId,
                    smusDomainAccountId: accountId,
                    smusProjectId: this.project?.id,
                    smusDomainRegion: this.authProvider.getDomainRegion(),
                })

                // Skip access check if we're in SMUS space environment (already in project space)
                if (!getContext('aws.smus.inSmusSpaceEnvironment')) {
                    const hasAccess = await this.checkProjectCredsAccess(this.project!.id)
                    if (!hasAccess) {
                        return [
                            {
                                id: 'smusProjectAccessDenied',
                                resource: {},
                                getTreeItem: () => {
                                    const item = new vscode.TreeItem(
                                        'You do not have access to this project. Contact your administrator.',
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
                if (getContext('aws.smus.inSmusSpaceEnvironment')) {
                    return [dataNode]
                }

                const dzClient = await DataZoneClient.getInstance(this.authProvider)
                if (!this.project?.id) {
                    throw new Error('Project ID is required')
                }
                const toolingEnv = await dzClient.getToolingEnvironment(this.project.id)
                const spaceAwsAccountRegion = toolingEnv.awsAccountRegion

                if (!spaceAwsAccountRegion) {
                    throw new Error('No AWS account region found in tooling environment')
                }
                if (this.isFirstTimeSelection && !this.hasShownFirstTimeMessage) {
                    this.hasShownFirstTimeMessage = true
                    void vscode.window.showInformationMessage(
                        'Find your space in the Explorer panel under SageMaker Unified Studio. Hover over any space and click the connection icon to connect remotely.'
                    )
                }
                this.sagemakerClient = await this.initializeSagemakerClient(spaceAwsAccountRegion)
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
        })
    }

    public getParent(): TreeNode | undefined {
        return this.parent
    }

    public async refreshNode(): Promise<void> {
        this.onDidChangeEmitter.fire()
    }

    public async setProject(project: any): Promise<void> {
        await this.cleanupProjectResources()
        this.isFirstTimeSelection = !this.project
        this.project = project
    }

    public getProject(): DataZoneProject | undefined {
        return this.project
    }

    public async clearProject(): Promise<void> {
        await this.cleanupProjectResources()
        // Don't clear project if we're in SMUS space environment
        if (!getContext('aws.smus.inSmusSpaceEnvironment')) {
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

    private async checkProjectCredsAccess(projectId: string): Promise<boolean> {
        // TODO: Ideally we should be checking user project access by calling fetchAllProjectMemberships
        // and checking if user is part of that, or get user groups and check if any of the groupIds
        // exists in the project memberships for more comprehensive access validation.
        try {
            const projectProvider = await this.authProvider.getProjectCredentialProvider(projectId)
            this.logger.info(`Successfully obtained project credentials provider for project ${projectId}`)
            await projectProvider.getCredentials()
            return true
        } catch (err) {
            // If err.name is 'AccessDeniedException', it means user doesn't have access to the project
            // We can safely return false in that case without logging the error
            if ((err as any).name === 'AccessDeniedException') {
                this.logger.debug(
                    'Access denied when obtaining project credentials, user likely lacks project access or role permissions'
                )
            }
            return false
        }
    }

    private async fetchProjectName(): Promise<void> {
        if (!this.project || !getContext('aws.smus.inSmusSpaceEnvironment')) {
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
        let awsCredentialProvider
        if (getContext('aws.smus.isExpressMode')) {
            const datazoneClient = await DataZoneClient.getInstance(this.authProvider)
            const projectId = this.project.id
            awsCredentialProvider = async (): Promise<AwsCredentialIdentity> => {
                const creds = await datazoneClient.getProjectDefaultEnvironmentCreds(projectId)
                if (!creds.accessKeyId || !creds.secretAccessKey) {
                    throw new ToolkitError('Missing default environment credentials', {
                        code: SmusErrorCodes.CredentialRetrievalFailed,
                    })
                }
                return {
                    accessKeyId: creds.accessKeyId!,
                    secretAccessKey: creds.secretAccessKey!,
                    sessionToken: creds.sessionToken,
                }
            }
        } else {
            const projectProvider = await this.authProvider.getProjectCredentialProvider(this.project.id)
            this.logger.info(`Successfully obtained project credentials provider for project ${this.project.id}`)
            awsCredentialProvider = async (): Promise<AwsCredentialIdentity> => {
                return await projectProvider.getCredentials()
            }
        }
        const sagemakerClient = new SagemakerClient(regionCode, awsCredentialProvider)
        return sagemakerClient
    }
}
