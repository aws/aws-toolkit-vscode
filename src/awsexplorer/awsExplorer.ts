/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { deleteCloudFormation } from '../lambda/commands/deleteCloudFormation'
import { deleteLambda } from '../lambda/commands/deleteLambda'
import { invokeLambda } from '../lambda/commands/invokeLambda'
import { CloudFormationStackNode } from '../lambda/explorer/cloudFormationNodes'
import { LambdaFunctionNode } from '../lambda/explorer/lambdaFunctionNode'
import { configureLocalLambda } from '../lambda/local/configureLocalLambda'
import { AwsContext } from '../shared/awsContext'
import { AwsContextTreeCollection } from '../shared/awsContextTreeCollection'
import { ext } from '../shared/extensionGlobals'
import { RegionProvider } from '../shared/regions/regionProvider'
import { ResourceFetcher } from '../shared/resourceFetcher'
import { TelemetryNamespace } from '../shared/telemetry/telemetryTypes'
import { registerCommand } from '../shared/telemetry/telemetryUtils'
import { RefreshableAwsTreeProvider } from '../shared/treeview/awsTreeProvider'
import { AWSCommandTreeNode } from '../shared/treeview/nodes/awsCommandTreeNode'
import { AWSTreeNodeBase } from '../shared/treeview/nodes/awsTreeNodeBase'
import { ErrorNode } from '../shared/treeview/nodes/errorNode'
import { showErrorDetails } from '../shared/treeview/webviews/showErrorDetails'
import { intersection, toMap, updateInPlace } from '../shared/utilities/collectionUtils'
import { localize } from '../shared/utilities/vsCodeUtils'
import { RegionNode } from './regionNode'

export class AwsExplorer implements vscode.TreeDataProvider<AWSTreeNodeBase>, RefreshableAwsTreeProvider {
    public viewProviderId: string = 'aws.explorer'
    public readonly onDidChangeTreeData: vscode.Event<AWSTreeNodeBase | undefined>
    private readonly _onDidChangeTreeData: vscode.EventEmitter<AWSTreeNodeBase | undefined>
    private readonly regionNodes: Map<string, RegionNode>

    public constructor(
        private readonly awsContext: AwsContext,
        private readonly awsContextTrees: AwsContextTreeCollection,
        private readonly regionProvider: RegionProvider,
        private readonly resourceFetcher: ResourceFetcher,
        private readonly lambdaOutputChannel: vscode.OutputChannel = vscode.window.createOutputChannel('AWS Lambda')
    ) {
        this._onDidChangeTreeData = new vscode.EventEmitter<AWSTreeNodeBase | undefined>()
        this.onDidChangeTreeData = this._onDidChangeTreeData.event
        this.regionNodes = new Map<string, RegionNode>()
    }

    public initialize(context: Pick<vscode.ExtensionContext, 'asAbsolutePath' | 'globalState'>): void {
        registerCommand({
            command: 'aws.refreshAwsExplorer',
            callback: async () => this.refresh()
        })

        registerCommand({
            command: 'aws.deleteLambda',
            callback: async (node: LambdaFunctionNode) =>
                await deleteLambda({
                    deleteParams: { functionName: node.configuration.FunctionName || '' },
                    lambdaClient: ext.toolkitClientBuilder.createLambdaClient(node.regionCode),
                    outputChannel: this.lambdaOutputChannel,
                    onRefresh: () => this.refresh(node.parent)
                }),
            telemetryName: {
                namespace: TelemetryNamespace.Lambda,
                name: 'delete'
            }
        })

        registerCommand({
            command: 'aws.deleteCloudFormation',
            callback: async (node: CloudFormationStackNode) =>
                await deleteCloudFormation(() => this.refresh(node.parent), node),
            telemetryName: {
                namespace: TelemetryNamespace.Cloudformation,
                name: 'delete'
            }
        })

        registerCommand({
            command: 'aws.showErrorDetails',
            callback: async (node: ErrorNode) => await showErrorDetails(node)
        })

        registerCommand({
            command: 'aws.invokeLambda',
            callback: async (node: LambdaFunctionNode) =>
                await invokeLambda({
                    awsContext: this.awsContext,
                    functionNode: node,
                    outputChannel: this.lambdaOutputChannel,
                    resourceFetcher: this.resourceFetcher
                }),
            telemetryName: {
                namespace: TelemetryNamespace.Lambda,
                name: 'invokeremote'
            }
        })

        registerCommand({
            command: 'aws.configureLambda',
            callback: configureLocalLambda,
            telemetryName: {
                namespace: TelemetryNamespace.Lambda,
                name: 'configurelocal'
            }
        })

        registerCommand({
            command: 'aws.refreshAwsExplorerNode',
            callback: async (awsExplorer: AwsExplorer, element: AWSTreeNodeBase) => {
                awsExplorer._onDidChangeTreeData.fire(element)
            }
        })

        this.awsContextTrees.addTree(this)
    }

    public getTreeItem(element: AWSTreeNodeBase): vscode.TreeItem {
        return element
    }

    public async getChildren(element?: AWSTreeNodeBase): Promise<AWSTreeNodeBase[]> {
        if (!!element) {
            try {
                return await element.getChildren()
            } catch (error) {
                return [
                    new AWSCommandTreeNode(
                        element,
                        localize(
                            'AWS.explorerNode.lambda.retry',
                            'Unable to load Lambda Functions, click here to retry'
                        ),
                        'aws.refreshAwsExplorerNode',
                        [this, element]
                    )
                ]
            }
        }

        const profileName = this.awsContext.getCredentialProfileName()
        if (!profileName) {
            return [
                new AWSCommandTreeNode(
                    undefined,
                    localize('AWS.explorerNode.signIn', 'Connect to AWS...'),
                    'aws.login',
                    undefined,
                    localize('AWS.explorerNode.signIn.tooltip', 'Connect to AWS using a credential profile')
                )
            ]
        }

        const explorerRegionCodes = await this.awsContext.getExplorerRegions()
        const regionMap = toMap(await this.regionProvider.getRegionData(), r => r.regionCode)

        updateInPlace(
            this.regionNodes,
            intersection(regionMap.keys(), explorerRegionCodes),
            key => this.regionNodes.get(key)!.update(regionMap.get(key)!),
            key => new RegionNode(regionMap.get(key)!)
        )

        if (this.regionNodes.size > 0) {
            return [...this.regionNodes.values()]
        } else {
            return [
                new AWSCommandTreeNode(
                    undefined,
                    localize('AWS.explorerNode.addRegion', 'Click to add a region to view functions...'),
                    'aws.showRegion',
                    undefined,
                    localize('AWS.explorerNode.addRegion.tooltip', 'Configure a region to show available functions')
                )
            ]
        }
    }

    public refresh(node?: AWSTreeNodeBase) {
        this._onDidChangeTreeData.fire(node)
    }
}
