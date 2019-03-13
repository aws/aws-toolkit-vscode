/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'
import { AwsContext } from '../shared/awsContext'
import { AwsContextTreeCollection } from '../shared/awsContextTreeCollection'
import { ext } from '../shared/extensionGlobals'
import { RegionProvider } from '../shared/regions/regionProvider'
import { ResourceFetcher } from '../shared/resourceFetcher'
import { Datum } from '../shared/telemetry/telemetryEvent'
import { defaultMetricDatum, registerCommand } from '../shared/telemetry/telemetryUtils'
import { AWSCommandTreeNode } from '../shared/treeview/awsCommandTreeNode'
import { AWSTreeNodeBase } from '../shared/treeview/awsTreeNodeBase'
import { RefreshableAwsTreeProvider } from '../shared/treeview/awsTreeProvider'
import { intersection, toMap, updateInPlace } from '../shared/utilities/collectionUtils'
import { localize } from '../shared/utilities/vsCodeUtils'
import { createNewSamApp } from './commands/createNewSamApp'
import { deleteCloudFormation } from './commands/deleteCloudFormation'
import { deleteLambda } from './commands/deleteLambda'
import { deploySamApplication } from './commands/deploySamApplication'
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

    public initialize(context: Pick<vscode.ExtensionContext, 'globalState'>): void {
        registerCommand({
            command: 'aws.refreshAwsExplorer',
            callback: async () => this.refresh()
        })

        const createNewSamAppCommand = 'aws.lambda.createNewSamApp'
        registerCommand({
            command: createNewSamAppCommand,
            callback: async (): Promise<{ datum: Datum }> => {
                const metadata = await createNewSamApp(context)
                const datum = defaultMetricDatum(createNewSamAppCommand)
                datum.metadata = metadata ? new Map([
                    ['runtime', metadata.runtime]
                ]) : undefined

                return {
                    datum
                }
            }
        })

        registerCommand({
            command: 'aws.deleteLambda',
            callback: async (node: StandaloneFunctionNode) => await deleteLambda({
                deleteParams: { functionName: node.configuration.FunctionName || '' },
                lambdaClient: ext.toolkitClientBuilder.createLambdaClient(node.regionCode),
                outputChannel: this.lambdaOutputChannel,
                onRefresh: () => this.refresh(node.parent)
            })
        })

        registerCommand({
            command: 'aws.deleteCloudFormation',
            callback: async (node: CloudFormationStackNode) => await deleteCloudFormation(
                () => this.refresh(node.parent),
                node
            )
        })

        registerCommand({
            command: 'aws.deploySamApplication',
            callback: async () => await deploySamApplication({
                outputChannel: this.lambdaOutputChannel,
                regionProvider: this.regionProvider
            })
        })

        registerCommand({
            command: 'aws.showErrorDetails',
            callback: async (node: ErrorNode) => await showErrorDetails(node)
        })

        registerCommand({
            command: 'aws.invokeLambda',
            callback: async (node: FunctionNodeBase) => await invokeLambda({
                awsContext: this.awsContext,
                element: node,
                outputChannel: this.lambdaOutputChannel,
                resourceFetcher: this.resourceFetcher
            })
        })

        registerCommand({
            command: 'aws.configureLambda',
            callback: configureLocalLambda
        })

        registerCommand({
            command: 'aws.getLambdaConfig',
            callback: async (node: FunctionNodeBase) => await getLambdaConfig(
                this.awsContext,
                node
            )
        })

        registerCommand({
            command: 'aws.getLambdaPolicy',
            callback: async (node: FunctionNodeBase) => {
                const functionNode: FunctionNodeBase = await utils.selectLambdaNode(this.awsContext, node)

                const policyProvider = new DefaultLambdaPolicyProvider(
                    functionNode.configuration.FunctionName!,
                    functionNode.regionCode
                )

                const view = new LambdaPolicyView(policyProvider)
                await view.load()
            }
        })

        registerCommand({
            command: 'aws.refreshLambdaProviderNode',
            callback: async (lambdaProvider: LambdaTreeDataProvider, element: AWSTreeNodeBase) => {
                lambdaProvider._onDidChangeTreeData.fire(element)
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
