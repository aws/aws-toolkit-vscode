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
import { DataZoneProject } from '../../shared/client/datazoneClient'
import { SageMakerUnifiedStudioRootNode } from './sageMakerUnifiedStudioRootNode'
import { SagemakerClient } from '../../../shared/clients/sagemaker'
import { SmusAuthenticationProvider } from '../../auth/providers/smusAuthenticationProvider'
import { SageMakerUnifiedStudioComputeNode } from './sageMakerUnifiedStudioComputeNode'

/**
 * Tree node representing a SageMaker Unified Studio project
 */
export class SageMakerUnifiedStudioProjectNode implements TreeNode {
    public readonly id = 'smusProjectNode'
    public readonly resource = this
    private readonly onDidChangeEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChangeTreeItem = this.onDidChangeEmitter.event
    public readonly onDidChangeChildren = this.onDidChangeEmitter.event
    private project?: DataZoneProject
    private logger = getLogger()
    private sagemakerClient?: SagemakerClient

    constructor(
        private readonly parent: SageMakerUnifiedStudioRootNode,
        private readonly authProvider: SmusAuthenticationProvider,
        private readonly extensionContext: vscode.ExtensionContext
    ) {}

    public async getTreeItem(): Promise<vscode.TreeItem> {
        if (this.project) {
            const item = new vscode.TreeItem('Project: ' + this.project.name, vscode.TreeItemCollapsibleState.Collapsed)
            item.contextValue = 'smusSelectedProject'
            item.tooltip = `Project: ${this.project.name}\nID: ${this.project.id}`
            return item
        }
        const item = new vscode.TreeItem('Select a project', vscode.TreeItemCollapsibleState.None)
        item.contextValue = 'smusProjectSelectPicker'
        item.command = {
            command: 'aws.smus.projectView',
            title: 'Select Project',
            arguments: [this],
        }
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
            const dataNode = new SageMakerUnifiedStudioDataNode(this)
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
        await this.authProvider.invalidateAllProjectCredentialsInCache()
        if (this.sagemakerClient) {
            this.sagemakerClient.dispose()
            this.sagemakerClient = undefined
        }
        this.project = project
        await this.refreshNode()
    }

    public getProject(): DataZoneProject | undefined {
        return this.project
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
