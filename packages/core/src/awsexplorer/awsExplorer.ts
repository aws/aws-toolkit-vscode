/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Auth } from '../auth/auth'
import { getIdeProperties } from '../shared/extensionUtilities'
import { getIcon } from '../shared/icons'
import { getLogger, Logger } from '../shared/logger'
import { RegionProvider } from '../shared/regions/regionProvider'
import { RefreshableAwsTreeProvider } from '../shared/treeview/awsTreeProvider'
import { AWSCommandTreeNode } from '../shared/treeview/nodes/awsCommandTreeNode'
import { AWSTreeNodeBase } from '../shared/treeview/nodes/awsTreeNodeBase'
import { makeChildrenNodes, TreeShim } from '../shared/treeview/utils'
import { intersection, toMap, updateInPlace } from '../shared/utilities/collectionUtils'
import { once } from '../shared/utilities/functionUtils'
import { localize } from '../shared/utilities/vsCodeUtils'
import { RegionNode } from './regionNode'
import { AuthNode, useIamCredentials } from '../auth/utils'

export class AwsExplorer implements vscode.TreeDataProvider<AWSTreeNodeBase>, RefreshableAwsTreeProvider {
    public viewProviderId: string = 'aws.explorer'
    public readonly onDidChangeTreeData: vscode.Event<AWSTreeNodeBase | undefined>
    private readonly logger: Logger = getLogger()
    private readonly _onDidChangeTreeData: vscode.EventEmitter<AWSTreeNodeBase | undefined>
    private readonly regionNodes: Map<string, RegionNode>

    private readonly rootNodeAddRegion = new AWSCommandTreeNode(
        undefined,
        localize('AWS.explorerNode.addRegion', 'Add regions to {0} Explorer...', getIdeProperties().company),
        'aws.showRegion',
        undefined,
        localize(
            'AWS.explorerNode.addRegion.tooltip',
            'Click here to add a region to {0} Explorer.',
            getIdeProperties().company
        )
    )

    public constructor(
        private readonly extContext: vscode.ExtensionContext,
        private readonly regionProvider: RegionProvider,
        private readonly auth = Auth.instance
    ) {
        this._onDidChangeTreeData = new vscode.EventEmitter<AWSTreeNodeBase | undefined>()
        this.onDidChangeTreeData = this._onDidChangeTreeData.event
        this.regionNodes = new Map<string, RegionNode>()

        this.extContext.subscriptions.push(
            this.regionProvider.onDidChange(() => {
                this.logger.verbose('Refreshing AWS Explorer due to Region Provider updates')
                this.refresh()
            }),
            this.auth.onDidChangeActiveConnection(() => this.refresh())
        )
    }

    public getTreeItem(element: AWSTreeNodeBase): vscode.TreeItem {
        return element
    }

    public async getChildren(element?: AWSTreeNodeBase): Promise<AWSTreeNodeBase[]> {
        if (element) {
            this.regionProvider.setLastTouchedRegion(element.regionCode)
        }

        let childNodes: AWSTreeNodeBase[] = []

        try {
            if (element) {
                childNodes = childNodes.concat(await element.getChildren())
            } else {
                childNodes = childNodes.concat(await this.getRootNodes())
            }
        } catch (err) {
            const error = err as Error
            this.logger.error(`Error getting children for node ${element?.label ?? 'Root Node'}: %s`, error)

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

    private readonly getAuthNode = once(() => new TreeShim(new AuthNode(this.auth)))
    private async getRootNodes(): Promise<AWSTreeNodeBase[]> {
        const conn = this.auth.activeConnection
        if (conn !== undefined && conn.type !== 'iam') {
            // TODO: this should show up as a child node?
            const selectIamNode = useIamCredentials.build(this.auth).asTreeNode({
                // label: `No IAM credentials linked to ${conn.label}`,
                // iconPath: getIcon('vscode-circle-slash'),
                label: 'Select IAM Credentials to View Resources',
                iconPath: getIcon('vscode-sync'),
            })

            return [this.getAuthNode(), new TreeShim(selectIamNode)]
        } else if (conn === undefined || conn.state !== 'valid') {
            return [this.getAuthNode()]
        }

        const partitionRegions = this.regionProvider.getRegions()
        const userVisibleRegionCodes = this.regionProvider.getExplorerRegions()
        const regionMap = toMap(partitionRegions, r => r.id)

        updateInPlace(
            this.regionNodes,
            intersection(regionMap.keys(), userVisibleRegionCodes),
            key => this.regionNodes.get(key)!.update(regionMap.get(key)!),
            key => new RegionNode(regionMap.get(key)!, this.regionProvider)
        )

        if (this.regionNodes.size === 0) {
            return [this.getAuthNode(), this.rootNodeAddRegion]
        }

        return await makeChildrenNodes({
            getChildNodes: async () => [this.getAuthNode(), ...this.regionNodes.values()],
            sort: (a, b) =>
                a instanceof TreeShim ? -1 : b instanceof TreeShim ? 1 : a.regionName.localeCompare(b.regionName),
        })
    }
}
