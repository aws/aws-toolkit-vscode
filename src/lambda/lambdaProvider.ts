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
import { RegionProvider } from '../shared/regions/regionProvider'
import { ResourceFetcher } from '../shared/resourceFetcher'
import { AWSCommandTreeNode } from '../shared/treeview/awsCommandTreeNode'
import { AWSTreeNodeBase } from '../shared/treeview/awsTreeNodeBase'
import { RefreshableAwsTreeProvider } from '../shared/treeview/refreshableAwsTreeProvider'
import { deployLambda } from './commands/deployLambda'
import { getLambdaConfig } from './commands/getLambdaConfig'
import { getLambdaPolicy } from './commands/getLambdaPolicy'
import { invokeLambda } from './commands/invokeLambda'
import { newLambda } from './commands/newLambda'
import { FunctionNode } from './explorer/functionNode'
import { RegionNode } from './explorer/regionNode'

export class LambdaProvider implements vscode.TreeDataProvider<AWSTreeNodeBase>, RefreshableAwsTreeProvider {
    public viewProviderId: string = 'lambda'
    public readonly onDidChangeTreeData: vscode.Event<AWSTreeNodeBase | undefined>
    private readonly _onDidChangeTreeData: vscode.EventEmitter<AWSTreeNodeBase | undefined>

    public constructor(
        private readonly awsContext: AwsContext,
        private readonly awsContextTrees: AwsContextTreeCollection,
        private readonly regionProvider: RegionProvider,
        private readonly resourceFetcher: ResourceFetcher
    ) {
        this._onDidChangeTreeData = new vscode.EventEmitter<AWSTreeNodeBase | undefined>()
        this.onDidChangeTreeData = this._onDidChangeTreeData.event
    }

    public initialize(): void {
        vscode.commands.registerCommand('aws.newLambda', async () => await newLambda())
        vscode.commands.registerCommand('aws.deployLambda', async (node: FunctionNode) => await deployLambda(node))

        vscode.commands.registerCommand(
            'aws.invokeLambda',
            async (node: FunctionNode) => await invokeLambda(this.awsContext, this.resourceFetcher, node)
        )
        vscode.commands.registerCommand(
            'aws.getLambdaConfig',
            async (node: FunctionNode) => await getLambdaConfig(this.awsContext, node))

        vscode.commands.registerCommand(
            'aws.getLambdaPolicy',
            async (node: FunctionNode) => await getLambdaPolicy(this.awsContext, node))

        vscode.commands.registerCommand(
            'aws.refreshLambdaProviderNode',
            async (lambdaProvider: LambdaProvider, element: AWSTreeNodeBase) => {
                lambdaProvider._onDidChangeTreeData.fire(element)
            }
        )

        this.awsContextTrees.addTree(this)
    }

    public getTreeItem(element: AWSTreeNodeBase): vscode.TreeItem {
        return element.getTreeItem()
    }

    public async getChildren(element?: AWSTreeNodeBase): Promise<AWSTreeNodeBase[]> {
        if (element) {
            try {
                return await element.getChildren()
            } catch (error) {
                return Promise.resolve([
                    new AWSCommandTreeNode(
                        localize(
                            'AWS.explorerNode.lambda.retry',
                            'Unable to load Lambda Functions, click here to retry'
                        ),
                        'aws.refreshLambdaProviderNode',
                        [this, element],
                    )
                ])
            }
        }

        const profileName = this.awsContext.getCredentialProfileName()
        if (!profileName) {
            return [
                new AWSCommandTreeNode(
                    localize('AWS.explorerNode.signIn', 'Connect to AWS...'),
                    'aws.login',
                    undefined,
                    localize('AWS.explorerNode.signIn.tooltip', 'Connect to AWS using a credential profile'))
            ]
        }

        const regionDefinitions = await this.regionProvider.getRegionData()
        const explorerRegionCodes = await this.awsContext.getExplorerRegions()

        if (explorerRegionCodes.length !== 0) {
            const regionNodes: RegionNode[] = []

            explorerRegionCodes.forEach(explorerRegionCode => {
                const region = regionDefinitions.find(r => r.regionCode === explorerRegionCode)
                const regionName = region ? region.regionName : explorerRegionCode
                regionNodes.push(new RegionNode(explorerRegionCode, regionName))
            })

            return regionNodes
        } else {
            return [
                new AWSCommandTreeNode(
                    localize('AWS.explorerNode.addRegion', 'Click to add a region to view functions...'),
                    'aws.showRegion',
                    undefined,
                    localize('AWS.explorerNode.addRegion.tooltip', 'Configure a region to show available functions'))
            ]
        }
    }

    public refresh(context?: AwsContext) {
        this._onDidChangeTreeData.fire()
    }
}
