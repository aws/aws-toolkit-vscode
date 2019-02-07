/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { AwsContext } from '../shared/awsContext'
import { AwsContextTreeCollection } from '../shared/awsContextTreeCollection'
import { ext } from '../shared/extensionGlobals'
import { RegionProvider } from '../shared/regions/regionProvider'
import { ResourceFetcher } from '../shared/resourceFetcher'
import { AWSCommandTreeNode } from '../shared/treeview/awsCommandTreeNode'
import { AWSTreeNodeBase } from '../shared/treeview/awsTreeNodeBase'
import { RefreshableAwsTreeProvider } from '../shared/treeview/awsTreeProvider'
import { intersection, toMap, updateInPlace } from '../shared/utilities/collectionUtils'
import { createNewSamApp } from './commands/createNewSamApp'
import { deleteCloudFormation } from './commands/deleteCloudFormation'
import { deleteLambda } from './commands/deleteLambda'
import { deployLambda } from './commands/deployLambda'
import { getLambdaConfig } from './commands/getLambdaConfig'
import { invokeLambda } from './commands/invokeLambda'
import { showErrorDetails } from './commands/showErrorDetails'
import { CloudFormationStackNode } from './explorer/cloudFormationNodes'
import { DefaultRegionNode } from './explorer/defaultRegionNode'
import { ErrorNode } from './explorer/errorNode'
import { FunctionNodeBase } from './explorer/functionNode'
import { RegionNode } from './explorer/regionNode'
import { StandaloneFunctionNode } from './explorer/standaloneNodes'
import { DefaultLambdaPolicyProvider, LambdaPolicyView } from './lambdaPolicy'
import { configureLocalLambda } from './local/configureLocalLambda'
import * as utils from './utils'

export class LambdaTreeDataProvider implements vscode.TreeDataProvider<AWSTreeNodeBase>, RefreshableAwsTreeProvider {
    public viewProviderId: string = 'lambda'
    public readonly onDidChangeTreeData: vscode.Event<AWSTreeNodeBase | undefined>
    private readonly _onDidChangeTreeData: vscode.EventEmitter<AWSTreeNodeBase | undefined>
    private readonly regionNodes: Map<string, RegionNode>

    public constructor(
        private readonly awsContext: AwsContext,
        private readonly awsContextTrees: AwsContextTreeCollection,
        private readonly regionProvider: RegionProvider,
        private readonly resourceFetcher: ResourceFetcher,
        private readonly getExtensionAbsolutePath: (relativeExtensionPath: string) => string,
        private readonly lambdaOutputChannel: vscode.OutputChannel = vscode.window.createOutputChannel('AWS Lambda'),
    ) {
        this._onDidChangeTreeData = new vscode.EventEmitter<AWSTreeNodeBase | undefined>()
        this.onDidChangeTreeData = this._onDidChangeTreeData.event
        this.regionNodes = new Map<string, RegionNode>()
    }

    public initialize(): void {
        vscode.commands.registerCommand('aws.refreshAwsExplorer', async () => this.refresh())
        vscode.commands.registerCommand(
            'aws.lambda.createNewSamApp',
            async () => await createNewSamApp()
        )

        vscode.commands.registerCommand(
            'aws.deleteLambda',
            async (node: StandaloneFunctionNode) => await deleteLambda({
                deleteParams: { functionName: node.configuration.FunctionName || '' },
                lambdaClient: ext.toolkitClientBuilder.createLambdaClient(node.regionCode),
                outputChannel: this.lambdaOutputChannel,
                onRefresh: () => this.refresh(node.parent)
            })
        )
        vscode.commands.registerCommand(
            'aws.deleteCloudFormation',
            async (node: CloudFormationStackNode) => await deleteCloudFormation(
                () => this.refresh(node.parent),
                node
            )
        )
        vscode.commands.registerCommand(
            'aws.deployLambda',
            async () => await deployLambda()
        )

        vscode.commands.registerCommand(
            'aws.showErrorDetails',
            async (node: ErrorNode) => await showErrorDetails(node)
        )

        vscode.commands.registerCommand(
            'aws.invokeLambda',
            async (node: FunctionNodeBase) => await invokeLambda({
                awsContext: this.awsContext,
                element: node,
                outputChannel: this.lambdaOutputChannel,
                resourceFetcher: this.resourceFetcher
            })
        )
        vscode.commands.registerCommand('aws.configureLambda', configureLocalLambda)
        vscode.commands.registerCommand(
            'aws.getLambdaConfig',
            async (node: FunctionNodeBase) => await getLambdaConfig(
                this.awsContext,
                node
            ))

        vscode.commands.registerCommand(
            'aws.getLambdaPolicy',
            async (node: FunctionNodeBase) => {
                const functionNode: FunctionNodeBase = await utils.selectLambdaNode(this.awsContext, node)

                const policyProvider = new DefaultLambdaPolicyProvider(
                    functionNode.configuration.FunctionName!,
                    functionNode.regionCode
                )

                const view = new LambdaPolicyView(policyProvider)
                await view.load()
            })

        vscode.commands.registerCommand(
            'aws.refreshLambdaProviderNode',
            async (lambdaProvider: LambdaTreeDataProvider, element: AWSTreeNodeBase) => {
                lambdaProvider._onDidChangeTreeData.fire(element)
            }
        )

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
                        'aws.refreshLambdaProviderNode',
                        [this, element],
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
                    localize('AWS.explorerNode.signIn.tooltip', 'Connect to AWS using a credential profile'))
            ]
        }

        const explorerRegionCodes = await this.awsContext.getExplorerRegions()
        const regionMap = toMap(await this.regionProvider.getRegionData(), r => r.regionCode)

        updateInPlace(
            this.regionNodes,
            intersection(regionMap.keys(), explorerRegionCodes),
            key => this.regionNodes.get(key)!.update(regionMap.get(key)!),
            key => new DefaultRegionNode(
                regionMap.get(key)!,
                relativeExtensionPath => this.getExtensionAbsolutePath(relativeExtensionPath)
            )
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
                    localize('AWS.explorerNode.addRegion.tooltip', 'Configure a region to show available functions'))
            ]
        }
    }

    public refresh(node?: AWSTreeNodeBase) {
        this._onDidChangeTreeData.fire(node)
    }
}
