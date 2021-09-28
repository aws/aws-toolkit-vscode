/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

import { ext } from '../shared/extensionGlobals'
import { AWSTreeNodeBase } from '../shared/treeview/nodes/awsTreeNodeBase'

export class CawsView implements vscode.TreeDataProvider<vscode.TreeItem> {
    public readonly viewId = 'aws.caws'
    public readonly onDidChangeTreeData: vscode.Event<AWSTreeNodeBase | undefined>
    private readonly _onDidChangeTreeData: vscode.EventEmitter<AWSTreeNodeBase | undefined>

    public constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter<AWSTreeNodeBase | undefined>()
        this.onDidChangeTreeData = this._onDidChangeTreeData.event
    }

    public refresh(node?: AWSTreeNodeBase): void {
        this._onDidChangeTreeData.fire(node)
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element
    }

    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        const isConnected = !!ext.awsContext.getCawsCredentials()
        if (!isConnected) {
            // Will show the "welcome view" (`viewsWelcome`).
            return Promise.resolve([])
        }

        return Promise.resolve([new vscode.TreeItem('TODO')])
    }
}
