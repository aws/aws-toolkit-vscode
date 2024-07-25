/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtContext } from '../shared/extensions'
import { viewDynamoDbTable } from './vue/tableView'
import { Commands } from '../shared/vscode/commands2'
import { copyDynamoDbArn } from './commands/sortDynamoDbTables'
import { DynamoDbTableNode } from './explorer/dynamoDbTableNode'
import { searchDynamoDbTables } from './commands/searchDynamoDbTables'
import { DynamoDbInstanceNode } from './explorer/dynamoDbInstanceNode'

export async function activate(context: ExtContext): Promise<void> {
    context.extensionContext.subscriptions.push(
        Commands.register('aws.dynamoDb.searchTables', async (node: DynamoDbTableNode | DynamoDbInstanceNode) => {
            const dynamoDbtableInfo =
                node instanceof DynamoDbTableNode
                    ? { regionName: node.regionCode, groupName: node.regionCode! }
                    : undefined
            const source = node ? (dynamoDbtableInfo ? 'ExplorerDynamoDbTableNode' : 'ExplorerServiceNode') : 'Command'
            await searchDynamoDbTables(context, source)
        }),

        Commands.register('aws.dynamoDb.copyArn', async (node: DynamoDbTableNode) => await copyDynamoDbArn(node)),

        Commands.register('aws.dynamoDb.refreshExplorer', async (node: DynamoDbInstanceNode) => node.refresh()),

        Commands.register(
            'aws.dynamoDb.viewTable',
            async (node: DynamoDbTableNode) => await viewDynamoDbTable(context, node)
        )
    )
}
