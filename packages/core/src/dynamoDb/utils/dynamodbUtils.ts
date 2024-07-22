/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { DynamoDB } from 'aws-sdk'
import { AttributeValue } from 'aws-sdk/clients/dynamodb'
import { DynamoDbTableNode } from '../explorer/dynamoDbTableNode'
import { DynamoDbClient } from '../../shared/clients/dynamoDbClient'

export interface RowData {
    [key: string]: string
}

export async function getTableContent(node: DynamoDbTableNode, client = new DynamoDbClient(node.regionCode)) {
    const items = await client.scanTable({ TableName: node.dynamoDbtable })
    const tableColumnsNames = getTableColumnsNames(items)
    const tableData = getTableItems(tableColumnsNames[0], items)
    return [tableColumnsNames[1], tableData]
}

export function getTableColumnsNames(items: DynamoDB.Types.ScanOutput): [Set<string>, RowData[]] {
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

    return [tableColumnsNames, tableHeader]
}

export function getTableItems(tableColumnsNames: Set<string>, items: DynamoDB.Types.ScanOutput) {
    const tableItems = []
    for (const item of items.Items ?? []) {
        var curItem: RowData = {}
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

function getAttributeValue(attribute: AttributeValue): { key: string; value: any } | undefined {
    const keys = Object.keys(attribute) as (keyof AttributeValue)[]
    for (const key of keys) {
        if (attribute[key] !== undefined) {
            return { key, value: attribute[key] }
        }
    }
    return undefined
}
