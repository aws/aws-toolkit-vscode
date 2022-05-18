/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as vscode from 'vscode'
import { getLogger } from '../../../shared/logger'
import { cdk } from '../../globals'
import { CdkAppLocation, getApp } from '../cdkProject'
import { ConstructNode, generateConstructNodes } from './constructNode'
import { TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'
import { createPlaceholderItem } from '../../../shared/treeview/utils'

/**
 * Represents a CDK App
 * Existence of apps is determined by the presence of `cdk.json` in a workspace folder
 */
export class AppNode implements TreeNode {
    public readonly id = this.makeId()
    public readonly resource = this.location
    public readonly treeItem: vscode.TreeItem

    public constructor(private readonly location: CdkAppLocation) {
        this.treeItem = this.createTreeItem()
    }

    public async getChildren(): Promise<(ConstructNode | TreeNode)[]> {
        const constructs = []
        try {
            const successfulApp = await getApp(this.location)

            const constructsInTree = successfulApp.constructTree.tree.children
            if (constructsInTree) {
                constructs.push(...generateConstructNodes(this.location, constructsInTree))
            }

            // indicate that App exists, but it is empty
            if (constructs.length === 0) {
                return [
                    createPlaceholderItem(localize('AWS.cdk.explorerNode.app.noStacks', '[No stacks in this CDK App]')),
                ]
            }

            return constructs
        } catch (error) {
            getLogger().error(`Could not load the construct tree located at '${this.id}': %O`, error as Error)

            return [
                createPlaceholderItem(
                    localize(
                        'AWS.cdk.explorerNode.app.noConstructTree',
                        '[Unable to load construct tree for this App. Run `cdk synth`]'
                    )
                ),
            ]
        }
    }

    private makeId() {
        const rootUri = vscode.Uri.joinPath(this.location.cdkJsonUri, '..')

        return vscode.workspace.asRelativePath(rootUri)
    }

    private createTreeItem() {
        const item = new vscode.TreeItem(this.location.cdkJsonUri, vscode.TreeItemCollapsibleState.Collapsed)
        item.contextValue = 'awsCdkAppNode'
        item.label = vscode.workspace.asRelativePath(vscode.Uri.joinPath(this.location.cdkJsonUri, '..'))

        item.iconPath = {
            dark: vscode.Uri.file(cdk.iconPaths.dark.cdk),
            light: vscode.Uri.file(cdk.iconPaths.light.cdk),
        }

        item.tooltip = this.location.cdkJsonUri.path

        return item
    }
}
