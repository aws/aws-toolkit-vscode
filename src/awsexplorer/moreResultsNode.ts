/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AWSTreeNodeBase } from '../shared/treeview/nodes/awsTreeNodeBase'
import { LoadMoreNode } from '../shared/treeview/nodes/loadMoreNode'
import { localize } from '../shared/utilities/vsCodeUtils'
import { inspect } from 'util'
import { loadMoreChildrenCommand } from './commands/loadMoreChildren'

/**
 * Represents the a "Load More..." node that appears as the last child of nodes more results.
 *
 * Clicking the node executes the Load More command for the parent Node.
 */
export class MoreResultsNode extends AWSTreeNodeBase {
    // Parent is a get method to prevent circular referencing
    public constructor(public parent: AWSTreeNodeBase & LoadMoreNode) {
        super(localize('AWS.explorerNode.loadMoreChildren', 'Load More...'))

        this.command = loadMoreChildrenCommand.build(parent).asCommand({
            title: localize('AWS.explorerNode.loadMoreChildren', 'Load More...'),
        })
        this.contextValue = 'awsMoreResultsNode'
    }

    public [inspect.custom](): string {
        return `MoreResultsNode (parent=${this.parent})`
    }
}
