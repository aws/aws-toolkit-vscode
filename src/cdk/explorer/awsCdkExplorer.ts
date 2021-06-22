/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as vscode from 'vscode'
import { RefreshableAwsTreeProvider } from '../../shared/treeview/awsTreeProvider'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { detectCdkProjects } from './detectCdkProjects'
import { AppNode } from './nodes/appNode'
import { CdkErrorNode } from './nodes/errorNode'

/**
 * Provides data for the AWS CDK Explorer view
 */
export class AwsCdkExplorer implements vscode.TreeDataProvider<AWSTreeNodeBase>, RefreshableAwsTreeProvider {
    public viewProviderId: string = 'aws.cdk.explorer'
    public visible = false
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
        if (!this.visible) {
            return []
        }
        if (element) {
            return element.getChildren()
        } else {
            const appsFound = await detectCdkProjects(vscode.workspace.workspaceFolders)

            if (appsFound.length === 0) {
                return [new CdkErrorNode(localize('AWS.cdk.explorerNode.noApps', '[No CDK Apps found in Workspaces]'))]
            }

            return appsFound.map(appLocation => new AppNode(appLocation))
        }
    }

    public refresh(node?: AWSTreeNodeBase): void {
        this.onDidChangeTreeDataEventEmitter.fire(undefined)
    }
}
