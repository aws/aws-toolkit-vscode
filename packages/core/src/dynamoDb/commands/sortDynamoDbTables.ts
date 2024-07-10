/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { copyToClipboard } from '../../shared/utilities/messages'
import { DynamoDbTableNode } from '../explorer/dynamoDbTableNode'
import { DynamoDbClient } from '../../shared/clients/dynamoDbClient'
import { DynamoDbInstanceNode } from '../explorer/dynamoDbInstanceNode'

export async function sortTablesByCreatedTime(node: DynamoDbInstanceNode) {
    console.log('I am trying to sort the tables by name.')
}

export async function copyDynamoDbArn(node: DynamoDbTableNode) {
    const response = await new DynamoDbClient(node.regionCode).getTableInformation({ TableName: node.dynamoDbtable })
    if (response.TableArn !== undefined) {
        await copyToClipboard(response.TableArn, 'ARN')
    }
}
