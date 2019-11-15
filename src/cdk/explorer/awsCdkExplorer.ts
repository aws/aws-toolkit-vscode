/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'
import { registerCommand } from '../../shared/telemetry/telemetryUtils'
import { RefreshableAwsTreeProvider } from '../../shared/treeview/awsTreeProvider'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { CdkProject, getProject } from './cdkProject'
import { detectCdkProjects } from './detectCdkProjects'
import { ConstructNode } from './nodes/constructNode'

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
            const projectLocations = await detectCdkProjects(vscode.workspace.workspaceFolders)
            const projects = await Promise.all(projectLocations.map(getProject))

            //TODO if there are no projects, return an empty / placeholder node
            return projects.map(getConstructNode)
        }
    }

    public refresh(node?: AWSTreeNodeBase) {
        this._onDidChangeTreeData.fire()
    }
}

/**
 * Given the path to tree.json, read all its id's.
 */
function getConstructNode(project: CdkProject): ConstructNode {
    return new ConstructNode(
        `${project.metadata.tree.id} (${project.location.cdkJsonPath})`,
        vscode.TreeItemCollapsibleState.Collapsed,
        project.metadata.tree
    )
}
