/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DynamoDB } from 'aws-sdk'
import { copyToClipboard } from '../../shared/utilities/messages'
import { DynamoDbTableNode } from '../explorer/dynamoDbTableNode'
import { DynamoDbClient } from '../../shared/clients/dynamoDbClient'
import { AttributeValue, Key, ScanInput } from 'aws-sdk/clients/dynamodb'

export interface RowData {
    [key: string]: string
}
export interface TableData {
    tableHeader: RowData[]
    tableContent: RowData[]
    lastEvaluatedKey?: Key
}

export async function getTableContent(
    tableRequest: ScanInput,
    regionCode: string,
    client = new DynamoDbClient(regionCode)
) {
    const response = await client.scanTable(tableRequest)
    const { columnNames, tableHeader } = getTableColumnsNames(response)
    const tableItems = getTableItems(columnNames, response)

    const tableData: TableData = {
        tableHeader: tableHeader,
        tableContent: tableItems,
        lastEvaluatedKey: response.LastEvaluatedKey,
    }
    return tableData
}

export function getTableColumnsNames(items: DynamoDB.Types.ScanOutput): {
    columnNames: Set<string>
    tableHeader: RowData[]
} {
    const tableColumnsNames = new Set<string>()
    const tableHeader = [] as RowData[]
    for (const item of items.Items ?? []) {
        for (const key of Object.keys(item)) {
            tableColumnsNames.add(key)
        }
    }
    for (const columnName of tableColumnsNames) {
        tableHeader.push({ columnDataKey: columnName, title: columnName })
    }

    return {
        columnNames: tableColumnsNames,
        tableHeader: tableHeader,
    }
}

export function getTableItems(tableColumnsNames: Set<string>, items: DynamoDB.Types.ScanOutput) {
    const tableItems = []
    for (const item of items.Items ?? []) {
        const curItem: RowData = {}
        for (const columnName of tableColumnsNames) {
            const columnValue = item[columnName] || undefined
            if (columnValue === undefined) {
                curItem[columnName] = ''
            } else {
                const attributeValue = getAttributeValue(columnValue)
                curItem[columnName] = attributeValue?.value
            }
        }
        tableItems.push(curItem)
    }
    return tableItems
}

export async function copyDynamoDbArn(node: DynamoDbTableNode) {
    const response = await new DynamoDbClient(node.regionCode).getTableInformation({ TableName: node.dynamoDbtable })
    if (response.TableArn !== undefined) {
        await copyToClipboard(response.TableArn, 'ARN')
    }
}

function getAttributeValue(attribute: AttributeValue): { key: string; value: any } | undefined {
    const keys = Object.keys(attribute) as (keyof AttributeValue)[]
    for (const key of keys) {
        const value = attribute[key]
        if (value !== undefined) {
            if (key === 'B' && Buffer.isBuffer(value)) {
                return { key, value: value.toString('base64') }
            }
            return { key, value: value }
        }
    }
    return undefined
}
