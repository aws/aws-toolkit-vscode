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

/**
 * Fetches the content of a DynamoDB table, including column names, headers, and items.
 * @param {ScanInput} tableRequest - The request object for scanning the DynamoDB table.
 * @param {string} regionCode - The AWS region code where the DynamoDB table is located.
 * @param {DynamoDbClient} [client=new DynamoDbClient(regionCode)] - An optional DynamoDbClient instance.
 * @returns {Promise<TableData>} The table data, including headers, items, and the last evaluated key.
 */
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

/**
 * Extracts the column names and table headers from a DynamoDB scan response.
 */
function getTableColumnsNames(items: DynamoDB.Types.ScanOutput): {
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

/**
 * Extracts the items from a DynamoDB scan response, using the provided column names.
 */
function getTableItems(tableColumnsNames: Set<string>, items: DynamoDB.Types.ScanOutput) {
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

/**
 * Copies the ARN of a DynamoDB table to the clipboard.
 * @param {DynamoDbTableNode} node - The DynamoDB table node containing table and region information.
 */
export async function copyDynamoDbArn(node: DynamoDbTableNode) {
    const response = await new DynamoDbClient(node.regionCode).getTableInformation({ TableName: node.dynamoDbtable })
    if (response.TableArn !== undefined) {
        await copyToClipboard(response.TableArn, 'ARN')
    }
}

/**
 * Extracts the value from a DynamoDB attribute.
 */
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
