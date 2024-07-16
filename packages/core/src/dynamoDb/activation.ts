/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Commands } from '../shared/vscode/commands2'
import { copyDynamoDbArn } from './commands/sortDynamoDbTables'
import { DynamoDbTableNode } from './explorer/dynamoDbTableNode'
import { searchDynamoDbTables } from './commands/searchDynamoDbTables'
import { DynamoDbInstanceNode } from './explorer/dynamoDbInstanceNode'

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    context.subscriptions.push(
        Commands.register('aws.dynamoDb.searchTables', async (node: DynamoDbTableNode | DynamoDbInstanceNode) => {
            const dynamoDbtableInfo =
                node instanceof DynamoDbTableNode
                    ? { regionName: node.regionCode, groupName: node.regionCode! }
                    : undefined
            const source = node ? (dynamoDbtableInfo ? 'ExplorerDynamoDbTableNode' : 'ExplorerServiceNode') : 'Command'
            await searchDynamoDbTables(source, dynamoDbtableInfo)
        }),

        Commands.register('aws.dynamoDb.copyArn', async (node: DynamoDbTableNode) => await copyDynamoDbArn(node)),

        Commands.register('aws.dynamoDb.refreshExplorer', async (node: DynamoDbInstanceNode) => node.refresh())
    )
}
