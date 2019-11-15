/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'
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
    private readonly onDidChangeTreeDataEventEmitter: vscode.EventEmitter<AWSTreeNodeBase | undefined>

    public get onDidChangeTreeData(): vscode.Event<AWSTreeNodeBase | undefined> {
        return this.onDidChangeTreeDataEventEmitter.event
    }

    public constructor() {
        this.onDidChangeTreeDataEventEmitter = new vscode.EventEmitter<AWSTreeNodeBase | undefined>()
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
        this.onDidChangeTreeDataEventEmitter.fire()
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
