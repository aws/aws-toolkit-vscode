/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import { TreeItemCollapsibleState } from 'vscode'
import { AWSTreeNodeBase } from '../../shared/treeview/awsTreeNodeBase'
import { PlaceholderNode } from './placeholderNode'

// Generic tree node with a label
export class GenericNode extends AWSTreeNodeBase {
    public constructor(label: string, children: AWSTreeNodeBase[]) {
        super(label, TreeItemCollapsibleState.Collapsed)
        this.children = children
        this.tooltip = label
    }

    public async getChildren(): Promise<AWSTreeNodeBase[]> {
        if (!this.children || this.children.length === 0) {
            return [new PlaceholderNode(
                localize('AWS.explorerNode.container.noItems', '[no items]')
            )]
        }

        return this.children
    }
}
