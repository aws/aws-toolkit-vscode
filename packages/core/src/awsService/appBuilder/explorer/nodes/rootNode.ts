/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { debugNewSamAppDocUrl } from '../../../../shared/constants'
import { telemetry } from '../../../../shared/telemetry/telemetry'
import { ResourceTreeDataProvider, TreeNode } from '../../../../shared/treeview/resourceTreeDataProvider'
import { createPlaceholderItem } from '../../../../shared/treeview/utils'
import { localize, openUrl } from '../../../../shared/utilities/vsCodeUtils'
import { Commands } from '../../../../shared/vscode/commands2'
import { AppNode } from './appNode'
import { detectSamProjects } from '../detectSamProjects'
import globals from '../../../../shared/extensionGlobals'
import { WalkthroughNode } from './walkthroughNode'

export async function getAppNodes(): Promise<TreeNode[]> {
    // no active workspace, show buttons in welcomeview
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        return []
    }

    const appsFound = await detectSamProjects()

    if (appsFound.length === 0) {
        return [
            createPlaceholderItem(
                localize('AWS.appBuilder.explorerNode.noApps', '[No IaC templates found in Workspaces]')
            ),
        ]
    }

    const nodesToReturn: TreeNode[] = appsFound
        .map((appLocation) => new AppNode(appLocation))
        .sort((a, b) => a.label.localeCompare(b.label) ?? 0)

    return nodesToReturn
}

export class AppBuilderRootNode implements TreeNode {
    public readonly id = 'appBuilder'
    public readonly resource = this
    private readonly onDidChangeChildrenEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChangeChildren = this.onDidChangeChildrenEmitter.event
    private readonly _refreshAppBuilderExplorer
    private readonly _refreshAppBuilderForFileExplorer

    constructor() {
        Commands.register('aws.appBuilder.viewDocs', () => {
            void openUrl(debugNewSamAppDocUrl.toolkit)
            telemetry.aws_help.emit({ name: 'appBuilder' })
        })
        this._refreshAppBuilderExplorer = (provider?: ResourceTreeDataProvider) =>
            Commands.register('aws.appBuilder.refresh', () => {
                this.refresh()
                if (provider) {
                    provider.refresh()
                }
            })

        this._refreshAppBuilderForFileExplorer = (provider?: ResourceTreeDataProvider) =>
            Commands.register('aws.appBuilderForFileExplorer.refresh', () => {
                this.refresh()
                if (provider) {
                    provider.refresh()
                }
            })
    }

    public get refreshAppBuilderExplorer() {
        return this._refreshAppBuilderExplorer
    }

    public get refreshAppBuilderForFileExplorer() {
        return this._refreshAppBuilderForFileExplorer
    }

    public async getChildren() {
        const nodesToReturn = await getAppNodes()
        if (nodesToReturn.length === 0) {
            return []
        }

        const walkthroughCompleted = globals.globalState.get('aws.toolkit.lambda.walkthroughCompleted')
        // show walkthrough node if walkthrough not completed yet
        if (!walkthroughCompleted) {
            nodesToReturn.unshift(new WalkthroughNode())
        }
        return nodesToReturn
    }

    public refresh(): void {
        this.onDidChangeChildrenEmitter.fire()
    }

    public getTreeItem() {
        const item = new vscode.TreeItem('APPLICATION BUILDER')
        item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed
        item.contextValue = 'awsAppBuilderRootNode'

        return item
    }

    static #instance: AppBuilderRootNode

    static get instance(): AppBuilderRootNode {
        return (this.#instance ??= new AppBuilderRootNode())
    }
}
