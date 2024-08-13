/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { DynamoDbTableNode } from './dynamoDbTableNode'
import { makeChildrenNodes } from '../../shared/treeview/utils'
import { DynamoDbClient } from '../../shared/clients/dynamoDbClient'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { toMap, toArrayAsync, updateInPlace } from '../../shared/utilities/collectionUtils'

export class DynamoDbInstanceNode extends AWSTreeNodeBase {
    protected readonly placeHolderMessage = '[No Tables Found]'
    protected dynamoDbTableNodes: Map<string, DynamoDbTableNode>

    public constructor(
        public override readonly regionCode: string,
        protected readonly dynamoDbClient = new DynamoDbClient(regionCode)
    ) {
        super('DynamoDB', vscode.TreeItemCollapsibleState.Collapsed)
        this.dynamoDbTableNodes = new Map<string, DynamoDbTableNode>()
        this.contextValue = 'awsDynamoDbRootNode'
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                await this.updateChildren()
                return [...this.dynamoDbTableNodes.values()]
            },
            getNoChildrenPlaceholderNode: async () => new PlaceholderNode(this, this.placeHolderMessage),
        })
    }

    public async updateChildren(): Promise<void> {
        const tables = toMap(await toArrayAsync(this.dynamoDbClient.getTables()), (configuration) => configuration)
        const sortedTablesByName = new Map([...tables.entries()].sort((a, b) => a[0].localeCompare(b[0])))
        updateInPlace(
            this.dynamoDbTableNodes,
            sortedTablesByName.keys(),
            (key) => this.dynamoDbTableNodes.get(key)!,
            (key) => new DynamoDbTableNode(this.regionCode, key, this)
        )
    }

    public async clearChildren() {
        this.dynamoDbTableNodes = new Map<string, DynamoDbTableNode>()
    }

    public async refreshNode(): Promise<void> {
        await this.clearChildren()
        await vscode.commands.executeCommand('aws.refreshAwsExplorerNode', this)
    }
}
