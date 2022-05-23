/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { cdkDocumentationUrl } from '../../shared/constants'
import { recordAwsHelp } from '../../shared/telemetry/telemetry.gen'
import { TreeNode } from '../../shared/treeview/resourceTreeDataProvider'
import { createPlaceholderItem } from '../../shared/treeview/utils'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { Commands } from '../../shared/vscode/commands2'
import { detectCdkProjects } from './detectCdkProjects'
import { AppNode } from './nodes/appNode'

export async function getAppNodes(): Promise<TreeNode[]> {
    const appsFound = await detectCdkProjects(vscode.workspace.workspaceFolders)

    if (appsFound.length === 0) {
        return [createPlaceholderItem(localize('AWS.cdk.explorerNode.noApps', '[No CDK Apps found in Workspaces]'))]
    }

    return appsFound.map(appLocation => new AppNode(appLocation))
}

export class CdkRootNode implements TreeNode {
    public readonly id = 'cdk'
    public readonly treeItem = this.createTreeItem()
    public readonly resource = this
    private readonly onDidChangeChildrenEmitter = new vscode.EventEmitter<void>()
    public readonly onDidChangeChildren = this.onDidChangeChildrenEmitter.event

    public async getChildren() {
        return (await getAppNodes()).sort((a, b) => a.treeItem?.label?.localeCompare(b.treeItem?.label ?? '') ?? 0)
    }

    public refresh(): void {
        this.onDidChangeChildrenEmitter.fire()
    }

    private createTreeItem() {
        const item = new vscode.TreeItem('CDK')
        item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed
        item.contextValue = 'awsCdkRootNode'

        return item
    }
}

export const cdkNode = new CdkRootNode()
export const refreshCdkExplorer = Commands.register('aws.cdk.refresh', cdkNode.refresh.bind(cdkNode))

Commands.register('aws.cdk.viewDocs', () => {
    vscode.env.openExternal(vscode.Uri.parse(cdkDocumentationUrl))
    recordAwsHelp({ name: 'cdk' })
})
