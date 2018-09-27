/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as nls from 'vscode-nls'
let localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { AWSTreeNodeBase } from '../shared/treeview/awsTreeNodeBase'
import { RefreshableAwsTreeProvider } from '../shared/treeview/refreshableAwsTreeProvider'
import { FunctionNode } from './explorer/functionNode'
import { getLambdaPolicy } from './commands/getLambdaPolicy'
import { invokeLambda } from './commands/invokeLambda'
import { newLambda } from './commands/newLambda'
import { deployLambda } from './commands/deployLambda'
import { getLambdaConfig } from './commands/getLambdaConfig'
import { AwsContext } from '../shared/awsContext'
import { AWSCommandTreeNode } from '../shared/treeview/awsCommandTreeNode'
import { RegionNode } from './explorer/regionNode'
import { RegionProvider } from "../shared/regions/regionProvider"
import { AwsContextTreeCollection } from '../shared/awsContextTreeCollection'
import { ResourceFetcher } from '../shared/resourceFetcher'

export class LambdaProvider implements vscode.TreeDataProvider<AWSTreeNodeBase>, RefreshableAwsTreeProvider {
    private _awsContext: AwsContext
    private _awsContextTrees: AwsContextTreeCollection
    private _regionProvider: RegionProvider
    private readonly _resourceFetcher: ResourceFetcher
    private _onDidChangeTreeData: vscode.EventEmitter<AWSTreeNodeBase | undefined> = new vscode.EventEmitter<AWSTreeNodeBase | undefined>()
    readonly onDidChangeTreeData: vscode.Event<AWSTreeNodeBase | undefined> = this._onDidChangeTreeData.event

    public viewProviderId: string = 'lambda'

    public initialize(): void {
        vscode.commands.registerCommand('aws.newLambda', async () => await newLambda())
        vscode.commands.registerCommand('aws.deployLambda', async (node: FunctionNode) => await deployLambda(node))
        vscode.commands.registerCommand('aws.invokeLambda', async (node: FunctionNode) => await invokeLambda(this._awsContext, this._resourceFetcher, node))
        vscode.commands.registerCommand('aws.getLambdaConfig', async (node: FunctionNode) => await getLambdaConfig(this._awsContext, node))
        vscode.commands.registerCommand('aws.getLambdaPolicy', async (node: FunctionNode) => await getLambdaPolicy(this._awsContext, node))
        vscode.commands.registerCommand('aws.refreshLambdaProviderNode', async (lambdaProvider: LambdaProvider, element: AWSTreeNodeBase) => {
            lambdaProvider._onDidChangeTreeData.fire(element)
        })

        this._awsContextTrees.addTree(this)
    }

    getTreeItem(element: AWSTreeNodeBase): vscode.TreeItem {
        return element.getTreeItem()
    }

    async getChildren(element?: AWSTreeNodeBase): Promise<AWSTreeNodeBase[]> {
        if (element) {
            try {
                return await element.getChildren()
            } catch (error) {
                return Promise.resolve([
                    new AWSCommandTreeNode(
                        localize("AWS.explorerNode.lambda.retry", "Unable to load Lambda Functions, click here to retry"),
                        "aws.refreshLambdaProviderNode",
                        [this, element],
                    )
                ])
            }
        }

        const profileName = this._awsContext.getCredentialProfileName()
        if (!profileName) {
            return [
                new AWSCommandTreeNode(localize('AWS.explorerNode.signIn', 'Connect to AWS...'),
                    'aws.login',
                    undefined,
                    localize('AWS.explorerNode.signIn.tooltip', 'Connect to AWS using a credential profile'))
            ]
        }

        const regionDefinitions = await this._regionProvider.getRegionData()
        const explorerRegionCodes = await this._awsContext.getExplorerRegions()

        if (explorerRegionCodes.length !== 0) {
            let regionNodes: RegionNode[] = []

            explorerRegionCodes.forEach(explorerRegionCode => {
                let region = regionDefinitions.find(region => region.regionCode === explorerRegionCode)
                let regionName = region ? region.regionName : explorerRegionCode
                regionNodes.push(new RegionNode(explorerRegionCode, regionName))
            })

            return regionNodes
        } else {
            return [
                new AWSCommandTreeNode(localize('AWS.explorerNode.addRegion', 'Click to add a region to view functions...'),
                    'aws.showRegion',
                    undefined,
                    localize('AWS.explorerNode.addRegion.tooltip', 'Configure a region to show available functions'))
            ]
        }
    }

    refresh(context?: AwsContext) {
        this._onDidChangeTreeData.fire()
    }

    constructor(awsContext: AwsContext, awsContextTreeCollection: AwsContextTreeCollection, regionProvider: RegionProvider, resourceFetcher: ResourceFetcher) {
        this._awsContext = awsContext
        this._awsContextTrees = awsContextTreeCollection
        this._regionProvider = regionProvider
        this._resourceFetcher = resourceFetcher
    }
}

