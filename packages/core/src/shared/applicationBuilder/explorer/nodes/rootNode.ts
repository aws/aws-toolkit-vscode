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

export async function getAppNodes(): Promise<TreeNode[]> {
    const appsFound = await detectSamProjects()

    if (appsFound.length === 0) {
        return [
            createPlaceholderItem(
                localize('AWS.applicationBuilder.explorerNode.noApps', '[No SAM Apps found in Workspaces]')
            ),
        ]
    }

    return appsFound.map((appLocation) => new AppNode(appLocation)).sort((a, b) => a.label.localeCompare(b.label) ?? 0)
}

export class ApplicationBuilderRootNode implements TreeNode {
    public readonly id = 'applicationBuilder'
    public readonly resource = this
    private readonly onDidChangeChildrenEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChangeChildren = this.onDidChangeChildrenEmitter.event
    private readonly _refreshApplicationBuilderExplorer
    private readonly _refreshapplicationBuilderForFileExplorer

    constructor() {
        Commands.register('aws.applicationBuilder.viewDocs', () => {
            void openUrl(vscode.Uri.parse(debugNewSamAppUrl))
            telemetry.aws_help.emit({ name: 'applicationBuilder' })
        })
        this._refreshApplicationBuilderExplorer = (provider?: ResourceTreeDataProvider) =>
            Commands.register('aws.applicationBuilder.refresh', () => {
                this.refresh()
                if (provider) {
                    provider.refresh()
                }
            })

        this._refreshapplicationBuilderForFileExplorer = (provider?: ResourceTreeDataProvider) =>
            Commands.register('aws.applicationBuilderForFileExplorer.refresh', () => {
                this.refresh()
                if (provider) {
                    provider.refresh()
                }
            })
    }

    public get refreshApplicationBuilderExplorer() {
        return this._refreshApplicationBuilderExplorer
    }

    public get refreshapplicationBuilderForFileExplorer() {
        return this._refreshapplicationBuilderForFileExplorer
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
        item.contextValue = 'awsApplicationBuilderRootNode'

        return item
    }

    static #instance: ApplicationBuilderRootNode

    static get instance(): ApplicationBuilderRootNode {
        return (this.#instance ??= new ApplicationBuilderRootNode())
    }
}
