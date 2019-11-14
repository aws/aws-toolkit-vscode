/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as fs from 'fs'
import * as vscode from 'vscode'
import { registerCommand } from '../../shared/telemetry/telemetryUtils'
import { RefreshableAwsTreeProvider } from '../../shared/treeview/awsTreeProvider'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { CdkProject, detectCdkProjects } from './detectCdkProjects'
import { ConstructNode } from './nodes/constructNode'
import { ConstructTree } from './tree/types'

/**
 * Provides data for the AWS CDK Explorer view
 */
export class AwsCdkExplorer implements vscode.TreeDataProvider<AWSTreeNodeBase>, RefreshableAwsTreeProvider {
    public viewProviderId: string = 'aws.cdk.explorer'
    public readonly onDidChangeTreeData: vscode.Event<AWSTreeNodeBase | undefined>
    private readonly _onDidChangeTreeData: vscode.EventEmitter<AWSTreeNodeBase | undefined>

    public constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter<AWSTreeNodeBase | undefined>()
        this.onDidChangeTreeData = this._onDidChangeTreeData.event
    }

    public initialize(context: Pick<vscode.ExtensionContext, 'asAbsolutePath' | 'globalState'>): void {
        registerCommand({
            command: 'aws.refreshCdkExplorer',
            callback: async () => this.refresh()
        })
    }

    public getTreeItem(element: AWSTreeNodeBase): vscode.TreeItem {
        return element
    }

    public async getChildren(element?: AWSTreeNodeBase): Promise<AWSTreeNodeBase[]> {
        if (element) {
            return element.getChildren()
        } else {
            const projects = await detectCdkProjects(vscode.workspace.workspaceFolders)

            return projects.map(getConstructTree)
        }

        // TODO temporary - what should be returned when no projects are found? placeholder? error? other?
        vscode.window.showInformationMessage('No AWS CDK projects detected in workspace! Build your application')

        return []
    }

    public refresh(node?: AWSTreeNodeBase) {
        this._onDidChangeTreeData.fire()
    }
}

/**
 * Given the path to tree.json, read all its id's.
 */
function getConstructTree(project: CdkProject): ConstructNode {
    const cdkTree = JSON.parse(fs.readFileSync(project.treePath, 'utf-8')) as ConstructTree
    const treeContent = cdkTree.tree

    return new ConstructNode(
        `${treeContent.id} (${project.cdkJsonPath})`,
        vscode.TreeItemCollapsibleState.Collapsed,
        treeContent
    )
}
