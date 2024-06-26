/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { makeChildrenNodes } from '../../shared/treeview/utils'
import { DynamoDbTableNode } from './dynamoDbTableNode'
import { DynamoDbClient } from '../../shared/clients/dynamoDbClient'

export class DynamoDbInstanceNode extends AWSTreeNodeBase {
    protected readonly placeHolderMessage = '[No Tables Found]'
    protected dynamoDbTableNodes: Map<string, DynamoDbTableNode>

    public constructor(public override readonly regionCode: string, protected readonly dynamoDbClient: DynamoDbClient) {
        super('DynamoDB', vscode.TreeItemCollapsibleState.Collapsed)
        this.dynamoDbTableNodes = new Map<string, DynamoDbTableNode>()
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                await this.updateChildren()

                return [...this.dynamoDbTableNodes.values()]
            },
        })
    }

    public async updateChildren(): Promise<void> {
        const tables = this.dynamoDbClient.getTables()
        console.log(tables)
    }
}
