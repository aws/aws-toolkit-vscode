/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { RegionProvider } from '../../../shared/regions/regionProvider'
import { AWSTreeNodeBase } from '../../../shared/treeview/nodes/awsTreeNodeBase'
import { PlaceholderNode } from '../../../shared/treeview/nodes/placeholderNode'
import { RefreshableAwsTreeProvider } from '../../../shared/treeview/awsTreeProvider'
import { CloudFormationRegionManager } from './regionManager'
import { StacksNode } from './nodes/stacksNode'
import { ResourcesNode } from './nodes/resourcesNode'
import { RegionSelectorNode } from './nodes/regionSelectorNode'
import { AwsCredentialsService } from '../auth/credentials'
import { getLogger } from '../../../shared/logger/logger'
import { getIcon } from '../../../shared/icons'
import globals from '../../../shared/extensionGlobals'

import { StacksManager } from '../stacks/stacksManager'
import { ResourcesManager } from '../resources/resourcesManager'

import { DocumentManager } from '../documents/documentManager'
import { ChangeSetsManager } from '../stacks/changeSetsManager'
import { CfnEnvironmentManager } from '../cfn-init/cfnEnvironmentManager'
import { CfnEnvironmentsNode } from './nodes/cfnEnvironmentsNode'
import { telemetry } from '../../../shared/telemetry/telemetry'
import { cloudFormationUiClickMetric } from '../utils'

export class CloudFormationExplorer implements vscode.TreeDataProvider<AWSTreeNodeBase>, RefreshableAwsTreeProvider {
    public viewProviderId: string = 'aws.cloudformation'
    public readonly onDidChangeTreeData: vscode.Event<AWSTreeNodeBase | undefined>
    private readonly _onDidChangeTreeData: vscode.EventEmitter<AWSTreeNodeBase | undefined>
    public readonly regionManager: CloudFormationRegionManager
    public readonly environmentManager: CfnEnvironmentManager
    private credentialsService: AwsCredentialsService | undefined

    public constructor(
        private readonly stacksManager: StacksManager,
        private readonly resourcesManager: ResourcesManager,
        private readonly changeSetsManager: ChangeSetsManager,
        documentManager: DocumentManager,
        regionProvider: RegionProvider,
        environmentManager: CfnEnvironmentManager
    ) {
        this._onDidChangeTreeData = new vscode.EventEmitter<AWSTreeNodeBase | undefined>()
        this.onDidChangeTreeData = this._onDidChangeTreeData.event
        this.regionManager = new CloudFormationRegionManager(regionProvider)
        this.environmentManager = environmentManager
    }

    public setCredentialsService(credentialsService: AwsCredentialsService): void {
        this.credentialsService = credentialsService
    }

    public async selectRegion(): Promise<void> {
        telemetry.ui_click.emit({ elementId: cloudFormationUiClickMetric })
        const changed = await this.regionManager.showRegionSelector()
        if (changed) {
            this.refresh()
            if (this.credentialsService) {
                await this.credentialsService.updateRegion()
            }
        }
    }

    public getTreeItem(element: AWSTreeNodeBase): vscode.TreeItem {
        return element
    }

    public async getChildren(element?: AWSTreeNodeBase): Promise<AWSTreeNodeBase[]> {
        if (!element) {
            return this.getRootChildren()
        }
        telemetry.ui_click.emit({ elementId: cloudFormationUiClickMetric })
        return element.getChildren()
    }

    private getRootChildren(): AWSTreeNodeBase[] {
        try {
            // Show sign-in message when not authenticated
            if (!globals.awsContext.getCredentialProfileName()) {
                const signInNode = new PlaceholderNode(this as any, 'Sign in to get started')
                signInNode.iconPath = getIcon('vscode-account')
                signInNode.command = {
                    command: 'aws.toolkit.login',
                    title: 'Sign in',
                }
                return [signInNode]
            }

            return [
                new RegionSelectorNode(this.regionManager),
                new CfnEnvironmentsNode(this.environmentManager),
                new StacksNode(this.stacksManager, this.changeSetsManager),
                new ResourcesNode(this.resourcesManager),
            ]
        } catch (error) {
            getLogger().error('CloudFormation explorer error: %O', error)
            return []
        }
    }

    public refresh(node?: AWSTreeNodeBase): void {
        this._onDidChangeTreeData.fire(node)
    }
}
