/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { TreeItem, TreeItemCollapsibleState } from 'vscode'
import { AWSTreeNodeBase } from '../../shared/treeview/awsTreeNodeBase'
import { NoFunctionsNode } from './noFunctionsNode'

// Simple container node with a label
export class ContainerNode extends AWSTreeNodeBase {

    public tooltip?: string

    public constructor(public label: string, public children: AWSTreeNodeBase[]) {
        super()
        this.tooltip = `${this.label}`
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        if (!this.children || this.children.length === 0) {
            return [new NoFunctionsNode(
                localize('AWS.explorerNode.container.noItens', '[no itens]'),
                'awsContainerNoItens'
            )]
        }

        return this.children
    }

    public getTreeItem(): TreeItem {
        const item = new TreeItem(this.getLabel(), TreeItemCollapsibleState.Collapsed)
        item.tooltip = this.tooltip
        item.contextValue = ''

        return item
    }

    protected getLabel(): string {
        return this.label
    }
}
