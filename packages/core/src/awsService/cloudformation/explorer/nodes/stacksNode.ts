/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItemCollapsibleState } from 'vscode'
import { AWSTreeNodeBase } from '../../../../shared/treeview/nodes/awsTreeNodeBase'
import { commandKey } from '../../utils'
import { StacksManager } from '../../stacks/stacksManager'
import { StackSummary } from '@aws-sdk/client-cloudformation'
import { ChangeSetsManager } from '../../stacks/changeSetsManager'
import { StackNode } from './stackNode'

class LoadMoreStacksNode extends AWSTreeNodeBase {
    public constructor(private readonly parent: StacksNode) {
        super('[Load More...]', TreeItemCollapsibleState.None)
        this.contextValue = 'loadMoreStacks'
        this.command = {
            title: 'Load More',
            command: commandKey('api.loadMoreStacks'),
            arguments: [this.parent],
        }
    }
}

export class StacksNode extends AWSTreeNodeBase {
    public constructor(
        private readonly stacksManager: StacksManager,
        private readonly changeSetsManager: ChangeSetsManager
    ) {
        super('Stacks', TreeItemCollapsibleState.Collapsed)
        this.updateNode()
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        this.updateNode()
        const stacks = this.stacksManager.get()
        const nodes = stacks.map((stack: StackSummary) => new StackNode(stack, this.changeSetsManager))
        return this.stacksManager.hasMore() ? [...nodes, new LoadMoreStacksNode(this)] : nodes
    }

    private updateNode(): void {
        const count = this.stacksManager.get().length
        const hasMore = this.stacksManager.hasMore()
        this.description = hasMore ? `(${count}+)` : `(${count})`
        this.contextValue = hasMore ? 'stackSectionWithMore' : 'stackSection'
    }

    public async loadMoreStacks(): Promise<void> {
        await this.stacksManager.loadMoreStacks()
        this.updateNode()
    }
}
