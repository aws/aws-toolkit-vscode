/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AwsContext } from '../shared/awsContext'
import { getIdeProperties } from '../shared/extensionUtilities'
import { getLogger, Logger } from '../shared/logger'
import { RegionProvider } from '../shared/regions/regionProvider'
import { getRegionsForActiveCredentials } from '../shared/regions/regionUtilities'
import { RefreshableAwsTreeProvider } from '../shared/treeview/awsTreeProvider'
import { AWSCommandTreeNode } from '../shared/treeview/nodes/awsCommandTreeNode'
import { AWSTreeNodeBase } from '../shared/treeview/nodes/awsTreeNodeBase'
import { makeChildrenNodes } from '../shared/treeview/treeNodeUtilities'
import { intersection, toMap, updateInPlace } from '../shared/utilities/collectionUtils'
import { localize } from '../shared/utilities/vsCodeUtils'
import { RegionNode } from './regionNode'

export class AwsExplorer implements vscode.TreeDataProvider<AWSTreeNodeBase>, RefreshableAwsTreeProvider {
    public viewProviderId: string = 'aws.explorer'
    public readonly onDidChangeTreeData: vscode.Event<AWSTreeNodeBase | undefined>
    private readonly logger: Logger = getLogger()
    private readonly _onDidChangeTreeData: vscode.EventEmitter<AWSTreeNodeBase | undefined>
    private readonly regionNodes: Map<string, RegionNode>

    private readonly ROOT_NODE_SIGN_IN = new AWSCommandTreeNode(
        undefined,
        localize('AWS.explorerNode.connecting.label', 'Connecting...'),
        'aws.login',
        undefined,
        localize('AWS.explorerNode.connecting.tooltip', 'Connecting...')
    )

    private readonly ROOT_NODE_ADD_REGION = new AWSCommandTreeNode(
        undefined,
        localize('AWS.explorerNode.addRegion', 'Add a region to {0} Explorer...', getIdeProperties().company),
        'aws.showRegion',
        undefined,
        localize('AWS.explorerNode.addRegion.tooltip', 'Click here to add a region to {0} Explorer.', getIdeProperties().company)
    )

    public constructor(
        private readonly extContext: vscode.ExtensionContext,
        private readonly awsContext: AwsContext,
        private readonly regionProvider: RegionProvider
    ) {
        this._onDidChangeTreeData = new vscode.EventEmitter<AWSTreeNodeBase | undefined>()
        this.onDidChangeTreeData = this._onDidChangeTreeData.event
        this.regionNodes = new Map<string, RegionNode>()
        this.extContext.subscriptions.push(
            this.awsContext.onDidChangeContext(e => {
                if (!e.accountId) {
                    this.ROOT_NODE_SIGN_IN.label = localize('AWS.explorerNode.signIn', 'Connect to {0}...', getIdeProperties().company)
                    this.ROOT_NODE_SIGN_IN.tooltip = localize(
                        'AWS.explorerNode.signIn.tooltip',
                        'Click here to select credentials for the {0} Toolkit',
                        getIdeProperties().company
                    )
                }
            })
        )
        this.extContext.subscriptions.push(
            this.regionProvider.onRegionProviderUpdated(() => {
                this.logger.verbose('Refreshing AWS Explorer due to Region Provider updates')
                this.refresh()
            })
        )
    }

    public getTreeItem(element: AWSTreeNodeBase): vscode.TreeItem {
        return element
    }

    public async getChildren(element?: AWSTreeNodeBase): Promise<AWSTreeNodeBase[]> {
        let childNodes: AWSTreeNodeBase[] = []

        try {
            if (element) {
                childNodes = childNodes.concat(await element.getChildren())
            } else {
                childNodes = childNodes.concat(await this.getRootNodes())
            }
        } catch (err) {
            const error = err as Error
            this.logger.error(`Error getting children for node ${element?.label ?? 'Root Node'}: %O`, error)

            childNodes.splice(
                0,
                childNodes.length,
                new AWSCommandTreeNode(
                    element,
                    localize('AWS.explorerNode.error.retry', 'Unable to get child nodes, click here to retry'),
                    'aws.refreshAwsExplorerNode',
                    [element],
                    error.message
                )
            )
        }

        return childNodes
    }

    public getRegionNodesSize(): number {
        return this.regionNodes.size
    }

    public refresh(node?: AWSTreeNodeBase): void {
        this._onDidChangeTreeData.fire(node)
    }

    private async getRootNodes(): Promise<AWSTreeNodeBase[]> {
        if (!(await this.awsContext.getCredentials())) {
            return [this.ROOT_NODE_SIGN_IN]
        }

        const partitionRegions = getRegionsForActiveCredentials(this.awsContext, this.regionProvider)

        const userVisibleRegionCodes = await this.awsContext.getExplorerRegions()
        const regionMap = toMap(partitionRegions, r => r.id)

        return await makeChildrenNodes({
            getChildNodes: async () => {
                updateInPlace(
                    this.regionNodes,
                    intersection(regionMap.keys(), userVisibleRegionCodes),
                    key => this.regionNodes.get(key)!.update(regionMap.get(key)!),
                    key => new RegionNode(regionMap.get(key)!, this.regionProvider)
                )

                return [...this.regionNodes.values()]
            },
            getErrorNode: async (error: Error, logID: number) => {
                // Let the calling function handle the error
                throw error
            },
            getNoChildrenPlaceholderNode: async () => this.ROOT_NODE_ADD_REGION,
            sort: (nodeA: RegionNode, nodeB: RegionNode) => nodeA.regionName.localeCompare(nodeB.regionName),
        })
    }
}
