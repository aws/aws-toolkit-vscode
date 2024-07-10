/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { DynamoDB } from 'aws-sdk'
import { DynamoDbTableNode } from './dynamoDbTableNode'
import { makeChildrenNodes } from '../../shared/treeview/utils'
import { DynamoDbClient } from '../../shared/clients/dynamoDbClient'
import { updateInPlace } from '../../shared/utilities/collectionUtils'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'

export class DynamoDbInstanceNode extends AWSTreeNodeBase {
    protected readonly placeHolderMessage = '[No Tables Found]'
    protected dynamoDbTableNodes: Map<string, DynamoDbTableNode>

    public constructor(public override readonly regionCode: string, protected readonly dynamoDbClient: DynamoDbClient) {
        super('DynamoDB', vscode.TreeItemCollapsibleState.Collapsed)
        this.dynamoDbTableNodes = new Map<string, DynamoDbTableNode>()
        this.contextValue = 'awsDynamoDbRootNode'
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                await this.fetchTableInfo()

                return [...this.dynamoDbTableNodes.values()]
            },
        })
    }

    public async fetchTableInfo(): Promise<void> {
        const tableNames = await this.dynamoDbClient.getTables()
        const tablesDescriptionMap = new Map<string, DynamoDB.Types.TableDescription>()

        await Promise.all(
            tableNames.map(async tableName => {
                const tableDescription: DynamoDB.Types.DescribeTableOutput =
                    await this.dynamoDbClient.getTableInformation({ TableName: tableName })
                if (tableDescription.Table) {
                    tablesDescriptionMap.set(tableName, tableDescription.Table)
                }
            })
        )

        const tablesMap = new Map([...tablesDescriptionMap.entries()].sort((a, b) => a[0].localeCompare(b[0])))

        updateInPlace(
            this.dynamoDbTableNodes,
            tablesMap.keys(),
            key => this.dynamoDbTableNodes.get(key)!,
            key => new DynamoDbTableNode(this.regionCode, tablesMap.get(key)!)
        )
    }
}
