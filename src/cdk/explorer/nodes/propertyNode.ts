/*!
 * Copyright 2018-2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import globals from '../../../shared/extensionGlobals'
import * as vscode from 'vscode'
import { TreeNode } from '../../../shared/treeview/resourceTreeDataProvider'

/*
 * Represents a property of a CDK construct. Properties can be simple key-value pairs, Arrays,
 * or objects that are nested deeply
 */
export class PropertyNode implements TreeNode {
    public readonly id = this.key
    public readonly resource = this.value
    public readonly treeItem: vscode.TreeItem

    public constructor(private readonly key: string, private readonly value: unknown) {
        this.treeItem = this.createTreeItem()
    }

    public async getChildren(): Promise<TreeNode[]> {
        if (this.value instanceof Array || this.value instanceof Object) {
            return generatePropertyNodes(this.value)
        } else {
            return []
        }
    }

    private createTreeItem() {
        const item = new vscode.TreeItem(`${this.key}: ${this.value}`)

        item.contextValue = 'awsCdkPropertyNode'
        item.iconPath = {
            dark: vscode.Uri.file(globals.iconPaths.dark.settings),
            light: vscode.Uri.file(globals.iconPaths.light.settings),
        }

        if (this.value instanceof Array || this.value instanceof Object) {
            item.label = this.key
            item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed
        }

        return item
    }
}

export function generatePropertyNodes(properties: { [key: string]: any }): TreeNode[] {
    return Object.entries(properties).map(([k, v]) => new PropertyNode(k, v))
}
