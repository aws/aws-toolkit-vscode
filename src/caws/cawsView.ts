/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { CawsClient, CawsClientFactory } from '../shared/clients/cawsClient'

import { AWSTreeNodeBase } from '../shared/treeview/nodes/awsTreeNodeBase'

export class CawsView implements vscode.TreeDataProvider<vscode.TreeItem> {
    public readonly viewId = 'aws.caws'
    public readonly onDidChangeTreeData: vscode.Event<AWSTreeNodeBase | undefined>
    private readonly _onDidChangeTreeData: vscode.EventEmitter<AWSTreeNodeBase | undefined>
    private client: CawsClient | undefined

    public constructor(private readonly clientFactory: CawsClientFactory) {
        this._onDidChangeTreeData = new vscode.EventEmitter<AWSTreeNodeBase | undefined>()
        this.onDidChangeTreeData = this._onDidChangeTreeData.event
    }

    public refresh(node?: AWSTreeNodeBase): void {
        this._onDidChangeTreeData.fire(node)
    }

    public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element
    }

    public async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (element === undefined) {
            this.client = await this.clientFactory()
        }
        if (!this.client?.connected) {
            // Will show the "welcome view" (`viewsWelcome`).
            return Promise.resolve([])
        }

        return Promise.resolve([new vscode.TreeItem('TODO')])
    }
}
