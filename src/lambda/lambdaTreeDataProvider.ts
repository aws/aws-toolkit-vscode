/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'
import { AwsContext } from '../shared/awsContext'
import { AwsContextTreeCollection } from '../shared/awsContextTreeCollection'
import { ext } from '../shared/extensionGlobals'
import { RegionProvider } from '../shared/regions/regionProvider'
import { ResourceFetcher } from '../shared/resourceFetcher'
import { Datum, TelemetryNamespace } from '../shared/telemetry/telemetryTypes'
import { defaultMetricDatum, registerCommand } from '../shared/telemetry/telemetryUtils'
import { AWSCommandTreeNode } from '../shared/treeview/awsCommandTreeNode'
import { AWSTreeNodeBase } from '../shared/treeview/awsTreeNodeBase'
import { RefreshableAwsTreeProvider } from '../shared/treeview/awsTreeProvider'
import { intersection, toMap, updateInPlace } from '../shared/utilities/collectionUtils'
import { ChannelLogger, localize } from '../shared/utilities/vsCodeUtils'
import {
    applyResultsToMetadata,
    createNewSamApplication,
    CreateNewSamApplicationResults
} from './commands/createNewSamApp'
import { deleteCloudFormation } from './commands/deleteCloudFormation'
import { deleteLambda } from './commands/deleteLambda'
import { deploySamApplication } from './commands/deploySamApplication'
import { invokeLambda } from './commands/invokeLambda'
import { showErrorDetails } from './commands/showErrorDetails'
import { CloudFormationStackNode } from './explorer/cloudFormationNodes'
import { DefaultRegionNode } from './explorer/defaultRegionNode'
import { ErrorNode } from './explorer/errorNode'
import { FunctionNodeBase } from './explorer/functionNode'
import { RegionNode } from './explorer/regionNode'
import { StandaloneFunctionNode } from './explorer/standaloneNodes'
import { configureLocalLambda } from './local/configureLocalLambda'

export class LambdaTreeDataProvider implements vscode.TreeDataProvider<AWSTreeNodeBase>, RefreshableAwsTreeProvider {
    public viewProviderId: string = 'aws.explorer'
    public readonly onDidChangeTreeData: vscode.Event<AWSTreeNodeBase | undefined>
    private readonly _onDidChangeTreeData: vscode.EventEmitter<AWSTreeNodeBase | undefined>
    private readonly regionNodes: Map<string, RegionNode>

    public constructor(
        private readonly awsContext: AwsContext,
        private readonly awsContextTrees: AwsContextTreeCollection,
        private readonly regionProvider: RegionProvider,
        private readonly resourceFetcher: ResourceFetcher,
        private readonly channelLogger: ChannelLogger,
        private readonly getExtensionAbsolutePath: (relativeExtensionPath: string) => string,
        private readonly lambdaOutputChannel: vscode.OutputChannel = vscode.window.createOutputChannel('AWS Lambda'),
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
            command: 'aws.lambda.createNewSamApp',
            callback: async (): Promise<{ datum: Datum }> => {
                const createNewSamApplicationResults: CreateNewSamApplicationResults = await createNewSamApplication(
                    this.channelLogger,
                    context
                )
                const datum = defaultMetricDatum('new')
                datum.metadata = new Map()
                applyResultsToMetadata(createNewSamApplicationResults, datum.metadata)

                return {
                    datum
                }
            },
            telemetryName: {
                namespace: TelemetryNamespace.Project,
                name: 'new'
            }
        })

        registerCommand({
            command: 'aws.deleteLambda',
            callback: async (node: StandaloneFunctionNode) => await deleteLambda({
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
            callback: async (node: CloudFormationStackNode) => await deleteCloudFormation(
                () => this.refresh(node.parent),
                node
            ),
            telemetryName: {
                namespace: TelemetryNamespace.Cloudformation,
                name: 'delete'
            }
        })

        registerCommand({
            command: 'aws.deploySamApplication',
            callback: async () => await deploySamApplication(
                {
                    channelLogger: this.channelLogger,
                    regionProvider: this.regionProvider,
                    extensionContext: context
                },
                {
                    awsContext: this.awsContext
                }
            ),
            telemetryName: {
                namespace: TelemetryNamespace.Lambda,
                name: 'deploy'
            }
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
