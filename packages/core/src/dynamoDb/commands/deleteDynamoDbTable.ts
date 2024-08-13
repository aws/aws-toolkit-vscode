/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger } from '../../shared'
import { telemetry } from '../../shared/telemetry'
import * as localizedText from '../../shared/localizedText'
import { localize } from '../../shared/utilities/vsCodeUtils'
import { DynamoDbClient } from '../../shared/clients/dynamoDbClient'
import { showConfirmationMessage } from '../../shared/utilities/messages'
import { DynamoDbTableNode } from '../explorer/dynamoDbTableNode'

export async function deleteDynamoDbTable(
    node: DynamoDbTableNode,
    client: DynamoDbClient = new DynamoDbClient(node.regionCode)
) {
    getLogger().debug(`Delete action called on DynamoDB table: ${node.dynamoDbtable}`)
    const isConfirmed = await showConfirmationMessage({
        prompt: localize(
            'AWS.dynamoDb.deleteTable.prompt',
            'Are you sure you want to delete the table {0}?',
            node.dynamoDbtable
        ),
        confirm: localizedText.localizedDelete,
        cancel: localizedText.cancel,
    })

    if (!isConfirmed) {
        getLogger().debug(`Delete action cancelled on DynamoDB table: ${node.dynamoDbtable}`)
        return
    }

    await telemetry.dynamodb_deleteTable.run(async () => {
        telemetry.record({ action: 'user' })
        try {
            const response = await client.deleteTable({ TableName: node.dynamoDbtable })
            if (response.TableDescription && response.TableDescription.TableName) {
                getLogger().debug(`Deleted DynamoDB table: ${response.TableDescription.TableName}`)
                await new Promise((resolve) => setTimeout(resolve, 3000)).then(async () => {
                    await node.parentNode.refreshNode()
                })
            }
        } catch (err) {
            const errorString = `Failed to delete DynamoDB table: ${node.dynamoDbtable}`
            getLogger().error(errorString)
            throw new Error(errorString)
        }
    })
}
