/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { debugNewSamAppUrl } from '../../../constants'
import { telemetry } from '../../../telemetry/telemetry'
import { ResourceTreeDataProvider, TreeNode } from '../../../treeview/resourceTreeDataProvider'
import { createPlaceholderItem } from '../../../treeview/utils'
import { localize, openUrl } from '../../../utilities/vsCodeUtils'
import { Commands } from '../../../vscode/commands2'
import { AppNode } from './appNode'
import { detectSamProjects } from '../detectSamProjects'
import globals from '../../../extensionGlobals'

export async function getAppNodes(): Promise<TreeNode[]> {
    // no active workspace, show buttons in welcomeview
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
        return []
    }

    const appsFound = await detectSamProjects()

    if (appsFound.length === 0) {
        return [
            new WalkthroughNode(),
            createPlaceholderItem(
                localize('AWS.appBuilder.explorerNode.noApps', '[No IaC templates found in Workspaces]')
            ),
        ]
    }

    const nodesToReturn: TreeNode[] = appsFound
        .map((appLocation) => new AppNode(appLocation))
        .sort((a, b) => a.label.localeCompare(b.label) ?? 0)
    const walkthroughCompleted = globals.globalState.get('aws.toolkit.lambda.walkthroughCompleted')
    // show walkthrough node if walkthrough not completed yet
    if (!walkthroughCompleted) {
        nodesToReturn.unshift(new WalkthroughNode())
    }
    return nodesToReturn
}

/**
 * Create Open Walkthrough Node in App builder sidebar
 *
 */
export class WalkthroughNode implements TreeNode {
    public readonly id = 'walkthrough'
    public readonly resource = this
    public constructor() {}

    public getTreeItem() {
        const itemLabel = localize('AWS.appBuilder.openWalkthroughTitle', 'Walkthrough of Application Builder')

        const item = new vscode.TreeItem(itemLabel)
        item.contextValue = 'awsWalkthroughNode'
        item.command = {
            title: localize('AWS.appBuilder.openWalkthroughTitle', 'Walkthrough of Application Builder'),
            command: 'aws.toolkit.lambda.openWalkthrough',
        }

        return item
    }
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
            void openUrl(vscode.Uri.parse(debugNewSamAppUrl))
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

    public getChildren() {
        return getAppNodes()
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
