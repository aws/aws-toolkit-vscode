/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { SageMakerUnifiedStudioComputeNode } from './sageMakerUnifiedStudioComputeNode'
import { updateInPlace } from '../../../shared/utilities/collectionUtils'
import { DescribeDomainResponse } from '@amzn/sagemaker-client'
import { getDomainUserProfileKey } from '../../../awsService/sagemaker/utils'
import { getLogger } from '../../../shared/logger/logger'
import { TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'
import { SagemakerClient, SagemakerSpaceApp } from '../../../shared/clients/sagemaker'
import { UserProfileMetadata } from '../../../awsService/sagemaker/explorer/sagemakerParentNode'
import { SagemakerUnifiedStudioSpaceNode } from './sageMakerUnifiedStudioSpaceNode'
import { PollingSet } from '../../../shared/utilities/pollingSet'
import { SmusAuthenticationProvider } from '../../auth/providers/smusAuthenticationProvider'
import { SmusUtils } from '../../shared/smusUtils'
import { getIcon } from '../../../shared/icons'
import { getContext } from '../../../shared/vscode/setContext'
import { createDZClientBaseOnDomainMode } from './utils'

export class SageMakerUnifiedStudioSpacesParentNode implements TreeNode {
    public readonly id = 'smusSpacesParentNode'
    public readonly resource = this
    private readonly sagemakerSpaceNodes: Map<string, SagemakerUnifiedStudioSpaceNode> = new Map()
    private spaceApps: Map<string, SagemakerSpaceApp> = new Map()
    private domainUserProfiles: Map<string, UserProfileMetadata> = new Map()
    private readonly logger = getLogger()
    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChangeTreeItem = this.onDidChangeEmitter.event
    public readonly onDidChangeChildren = this.onDidChangeEmitter.event
    public readonly pollingSet: PollingSet<string> = new PollingSet(5, this.updatePendingNodes.bind(this))
    private spaceAwsAccountRegion: string | undefined

    public constructor(
        private readonly parent: SageMakerUnifiedStudioComputeNode,
        private readonly projectId: string,
        private readonly extensionContext: vscode.ExtensionContext,
        private readonly authProvider: SmusAuthenticationProvider,
        private readonly sagemakerClient: SagemakerClient
    ) {}

    public async getTreeItem(): Promise<vscode.TreeItem> {
        const item = new vscode.TreeItem('Spaces', vscode.TreeItemCollapsibleState.Expanded)
        item.iconPath = {
            light: vscode.Uri.joinPath(
                this.extensionContext.extensionUri,
                'resources/icons/aws/sagemakerunifiedstudio/spaces-dark.svg'
            ),
            dark: vscode.Uri.joinPath(
                this.extensionContext.extensionUri,
                'resources/icons/aws/sagemakerunifiedstudio/spaces.svg'
            ),
        }
        item.contextValue = 'smusSpacesNode'
        item.description = 'Hover over any space and click the connection icon to connect remotely'
        item.tooltip = item.description
        return item
    }

    public async getChildren(): Promise<TreeNode[]> {
        try {
            await this.updateChildren()
        } catch (err) {
            const error = err as Error
            if (error.name === 'AccessDeniedException') {
                return this.getAccessDeniedChildren()
            }
            return this.getNoSpacesFoundChildren()
        }
        const nodes = [...this.sagemakerSpaceNodes.values()]
        if (nodes.length === 0) {
            return this.getNoSpacesFoundChildren()
        }
        return nodes
    }

    private getNoSpacesFoundChildren(): TreeNode[] {
        return [
            {
                id: 'smusNoSpaces',
                resource: {},
                getTreeItem: () => new vscode.TreeItem('[No Spaces found]', vscode.TreeItemCollapsibleState.None),
                getParent: () => this,
            },
        ]
    }

    private getAccessDeniedChildren(): TreeNode[] {
        return [
            {
                id: 'smusAccessDenied',
                resource: {},
                getTreeItem: () => {
                    const item = new vscode.TreeItem(
                        "You don't have permission to view spaces. Please contact your administrator.",
                        vscode.TreeItemCollapsibleState.None
                    )
                    item.iconPath = getIcon('vscode-error')
                    return item
                },
                getParent: () => this,
            },
        ]
    }

    public getParent(): TreeNode | undefined {
        return this.parent
    }

    public getProjectId(): string {
        return this.projectId
    }

    public getAuthProvider(): SmusAuthenticationProvider {
        return this.authProvider
    }

    public async refreshNode(): Promise<void> {
        this.onDidChangeEmitter.fire()
    }

    public trackPendingNode(domainSpaceKey: string) {
        this.pollingSet.add(domainSpaceKey)
    }

    public getSpaceNodes(spaceKey: string): SagemakerUnifiedStudioSpaceNode {
        const childNode = this.sagemakerSpaceNodes.get(spaceKey)
        if (childNode) {
            return childNode
        } else {
            throw new Error(`Node with id ${spaceKey} from polling set not found`)
        }
    }

    public async getSageMakerDomainId(): Promise<string> {
        const activeConnection = this.authProvider.activeConnection
        if (!activeConnection) {
            this.logger.error('There is no active connection to get SageMaker domain ID')
            throw new Error('No active connection found to get SageMaker domain ID')
        }

        this.logger.debug('SMUS: Getting DataZone client instance')
        const datazoneClient = await createDZClientBaseOnDomainMode(this.authProvider)
        if (!datazoneClient) {
            throw new Error('DataZone client is not initialized')
        }

        const toolingEnv = await datazoneClient.getToolingEnvironment(this.projectId)
        this.spaceAwsAccountRegion = toolingEnv.awsAccountRegion
        if (toolingEnv.provisionedResources) {
            for (const resource of toolingEnv.provisionedResources) {
                if (resource.name === 'sageMakerDomainId') {
                    if (!resource.value) {
                        throw new Error('SageMaker domain ID not found in tooling environment')
                    }
                    getLogger().debug(`Found SageMaker domain ID: ${resource.value}`)
                    return resource.value
                }
            }
        }
        throw new Error('No SageMaker domain found in the tooling environment')
    }

    private async updatePendingNodes() {
        for (const spaceKey of this.pollingSet.values()) {
            const childNode = this.getSpaceNodes(spaceKey)
            await this.updatePendingSpaceNode(childNode)
        }
    }

    private async updatePendingSpaceNode(node: SagemakerUnifiedStudioSpaceNode) {
        await node.updateSpaceAppStatus()
        if (!node.isPending()) {
            this.pollingSet.delete(node.DomainSpaceKey)
            await node.refreshNode()
        }
    }

    private async updateChildren(): Promise<void> {
        const datazoneClient = await createDZClientBaseOnDomainMode(this.authProvider)

        let userProfileId
        if (getContext('aws.smus.isExpressMode')) {
            userProfileId = await datazoneClient?.getUserProfileId()
        } else {
            // Will be of format: 'ABCA4NU3S7PEOLDQPLXYZ:user-12345678-d061-70a4-0bf2-eeee67a6ab12'
            const userId = await datazoneClient.getUserId()
            userProfileId = SmusUtils.extractSSOIdFromUserId(userId || '')
        }

        const sagemakerDomainId = await this.getSageMakerDomainId()
        const [spaceApps, domains] = await this.sagemakerClient.fetchSpaceAppsAndDomains(
            sagemakerDomainId,
            false /* filterSmusDomains */
        )
        // Filter spaceApps to only show spaces owned by current user
        this.logger.debug(`SMUS: Filtering spaces for user profile ID: ${userProfileId}`)
        const filteredSpaceApps = new Map<string, SagemakerSpaceApp>()
        for (const [key, app] of spaceApps.entries()) {
            const userProfile = app.OwnershipSettingsSummary?.OwnerUserProfileName
            if (userProfileId === userProfile) {
                filteredSpaceApps.set(key, app)
            }
        }
        this.spaceApps = filteredSpaceApps
        this.domainUserProfiles.clear()

        for (const app of this.spaceApps.values()) {
            const domainId = app.DomainId
            const userProfile = app.OwnershipSettingsSummary?.OwnerUserProfileName
            if (!domainId || !userProfile) {
                continue
            }

            const domainUserProfileKey = getDomainUserProfileKey(domainId, userProfile)
            this.domainUserProfiles.set(domainUserProfileKey, {
                domain: domains.get(domainId) as DescribeDomainResponse,
            })
        }

        updateInPlace(
            this.sagemakerSpaceNodes,
            this.spaceApps.keys(),
            (key) => this.sagemakerSpaceNodes.get(key)!.updateSpace(this.spaceApps.get(key)!),
            (key) =>
                new SagemakerUnifiedStudioSpaceNode(
                    this as any,
                    this.sagemakerClient,
                    this.spaceAwsAccountRegion ||
                        (() => {
                            throw new Error('No AWS account region found in tooling environment')
                        })(),
                    this.spaceApps.get(key)!,
                    true /* isSMUSSpace */
                )
        )
    }
}
