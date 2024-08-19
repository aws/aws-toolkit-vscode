/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { ExtContext } from '../../shared/extensions'
import { copyDynamoDbArn } from './utils/dynamodb'
import { viewDynamoDbTable } from './vue/tableView'
import { dynamoDbConsoleUrl } from './utils/dynamodb'
import { Commands } from '../../shared/vscode/commands2'
import { DynamoDbTableNode } from './explorer/dynamoDbTableNode'
import { deleteDynamoDbTable } from './commands/deleteDynamoDbTable'
import { searchDynamoDbTables } from './commands/searchDynamoDbTables'
import { DynamoDbInstanceNode } from './explorer/dynamoDbInstanceNode'
import { telemetry } from '../../shared/telemetry'

export async function activate(context: ExtContext): Promise<void> {
    context.extensionContext.subscriptions.push(
        Commands.register('aws.dynamoDb.searchTables', async (node: DynamoDbTableNode | DynamoDbInstanceNode) => {
            const source = node ? 'ExplorerDynamoDbInstanceNode' : 'Command'
            await searchDynamoDbTables(context, source)
        }),

        Commands.register('aws.dynamoDb.copyArn', async (node: DynamoDbTableNode) => await copyDynamoDbArn(node)),

        Commands.register('aws.dynamoDb.refreshExplorer', async (node: DynamoDbInstanceNode) => node.refresh()),

        Commands.register('aws.dynamoDb.viewTable', async (node: DynamoDbTableNode) => {
            return telemetry.dynamodb_openTable.run(async () => {
                await viewDynamoDbTable(context, node)
            })
        }),

        Commands.register('aws.dynamoDb.deleteTable', async (node: DynamoDbTableNode) => {
            await deleteDynamoDbTable(node)
        }),

        Commands.register('aws.dynamoDb.openTableInConsole', async (node: DynamoDbTableNode) => {
            const url = dynamoDbConsoleUrl(node)
            return vscode.env.openExternal(url)
        })
    )
}
