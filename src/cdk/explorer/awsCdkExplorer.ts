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
import { detectCdkProjects } from './detectCdkProjects'
import { ConstructNode } from './nodes/constructNode'
import { ConstructTree, ConstructTreeEntity } from './tree/types'

/**
 * Provides data for the AWS CDK Explorer view
 */
export class AwsCdkExplorer implements vscode.TreeDataProvider<AWSTreeNodeBase>, RefreshableAwsTreeProvider {
    public viewProviderId: string = 'aws.cdk.explorer'
    public readonly onDidChangeTreeData: vscode.Event<AWSTreeNodeBase | undefined>
    private readonly _onDidChangeTreeData: vscode.EventEmitter<AWSTreeNodeBase | undefined>
    private readonly workspaceFolders: vscode.WorkspaceFolder[] | undefined = vscode.workspace.workspaceFolders

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
        if (!(this.workspaceFolders && this.workspaceFolders[0])) {
            // TODO temporary - what should be returned when there's an empty workspace?
            vscode.window.showInformationMessage('empty workspace!')

            return Promise.resolve([])
        }

        if (!!element) {
            return Promise.resolve(element.getChildren())
        } else {
            const projects = await detectCdkProjects(vscode.workspace.workspaceFolders)
            for (const project of projects) {
                return Promise.resolve(this.getConstructTree(project.treePath))
            }
        }

        // TODO temporary - what should be returned when no projects are found
        vscode.window.showInformationMessage('No AWS CDK projects detected in workspace! Build your application')

        return Promise.resolve([])
    }

    public refresh(node?: AWSTreeNodeBase) {
        this._onDidChangeTreeData.fire()
    }

    /**
     * Given the path to tree.json, read all its id's.
     */
    private getConstructTree(treeJsonPath: string): ConstructNode[] {
        const cdkTree = <ConstructTree>JSON.parse(fs.readFileSync(treeJsonPath, 'utf-8'))
        const treeContent = <ConstructTreeEntity>cdkTree.tree

        return [
            new ConstructNode(
                treeContent.id,
                treeContent.path,
                vscode.TreeItemCollapsibleState.Collapsed,
                treeContent.children
            )
        ]
    }
}
