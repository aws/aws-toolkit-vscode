/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { TreeItemCollapsibleState, ThemeIcon, ThemeColor } from 'vscode'
import { AWSTreeNodeBase } from '../../../../shared/treeview/nodes/awsTreeNodeBase'
import { ChangeSetsManager } from '../../stacks/changeSetsManager'
import { ChangeSetInfo } from '../../stacks/actions/stackActionRequestType'
import { commandKey } from '../../utils'

class LoadMoreChangeSetsNode extends AWSTreeNodeBase {
    public constructor(private readonly parent: StackChangeSetsNode) {
        super('[Load More...]', TreeItemCollapsibleState.None)
        this.contextValue = 'loadMoreChangeSets'
        this.command = {
            title: 'Load More',
            command: commandKey('api.loadMoreChangeSets'),
            arguments: [this.parent],
        }
    }
}

class NoChangeSetsNode extends AWSTreeNodeBase {
    public constructor() {
        super('No change sets found', TreeItemCollapsibleState.None)
        this.contextValue = 'noChangeSets'
        this.iconPath = new ThemeIcon('info')
    }
}

export class StackChangeSetsNode extends AWSTreeNodeBase {
    public constructor(
        private readonly stackName: string,
        private readonly changeSetsManager: ChangeSetsManager
    ) {
        super('Change Sets', TreeItemCollapsibleState.Collapsed)
        this.contextValue = 'stackChangeSets'
        this.iconPath = new ThemeIcon('diff')
        this.updateNode()
    }

    private updateNode(): void {
        const count = this.changeSetsManager.get(this.stackName).length
        const hasMore = this.changeSetsManager.hasMore(this.stackName)
        this.description = hasMore ? `(${count}+)` : `(${count})`
        this.contextValue = hasMore ? 'stackChangeSetsWithMore' : 'stackChangeSets'
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        const changeSets = await this.changeSetsManager.getChangeSets(this.stackName)
        this.updateNode()

        if (changeSets.length === 0) {
            return [new NoChangeSetsNode()]
        }

        const nodes = changeSets.map((changeSet) => new ChangeSetNode(changeSet, this.stackName))
        return this.changeSetsManager.hasMore(this.stackName) ? [...nodes, new LoadMoreChangeSetsNode(this)] : nodes
    }

    public async loadMoreChangeSets(): Promise<void> {
        await this.changeSetsManager.loadMoreChangeSets(this.stackName)
        this.updateNode()
    }
}

export class ChangeSetNode extends AWSTreeNodeBase {
    public readonly stackName: string
    public readonly changeSetName: string

    public constructor(
        public readonly changeSet: ChangeSetInfo,
        stackName: string
    ) {
        super(changeSet.changeSetName, TreeItemCollapsibleState.None)
        this.stackName = stackName
        this.changeSetName = changeSet.changeSetName
        this.contextValue = 'changeSet'
        this.tooltip = `${changeSet.changeSetName} [${changeSet.status}]`
        this.iconPath = this.getIconForStatus(changeSet.status)
        this.stackName = stackName
        this.changeSetName = changeSet.changeSetName
    }

    private getIconForStatus(status: string): ThemeIcon {
        switch (status) {
            case 'CREATE_PENDING':
            case 'DELETE_PENDING':
                return new ThemeIcon('clock')
            case 'CREATE_IN_PROGRESS':
            case 'DELETE_IN_PROGRESS':
                return new ThemeIcon('sync~spin', new ThemeColor('charts.yellow'))
            case 'CREATE_COMPLETE':
                return new ThemeIcon('check', new ThemeColor('charts.green'))
            case 'DELETE_COMPLETE':
                return new ThemeIcon('trash')
            case 'DELETE_FAILED':
            case 'FAILED':
                return new ThemeIcon('error', new ThemeColor('charts.red'))
            default:
                return new ThemeIcon('git-commit')
        }
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return []
    }
}
