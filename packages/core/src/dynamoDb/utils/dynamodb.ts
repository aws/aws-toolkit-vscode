/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { DynamoDB } from 'aws-sdk'
import { Settings } from '../../shared'
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

export interface ColumnAttribute {
    name: string
    dataType: 'S' | 'N' | 'B' | string
}

export interface TableSchema {
    partitionKey: ColumnAttribute
    sortKey?: ColumnAttribute
}

export async function getTableContent(
    tableRequest: ScanInput,
    regionCode: string,
    client = new DynamoDbClient(regionCode)
) {
    tableRequest.Limit = await getMaxItemsPerPage()
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

/**
 * Copies the ARN of a DynamoDB table to the clipboard.
 * @param {DynamoDbTableNode} node - The DynamoDB table node containing table and region information.
 */
export async function copyDynamoDbArn(node: DynamoDbTableNode, client = new DynamoDbClient(node.regionCode)) {
    const response = await client.getTableInformation({ TableName: node.dynamoDbtable })
    if (response.TableArn !== undefined) {
        await copyToClipboard(response.TableArn, 'ARN')
    }
}

export async function queryTableContent(
    queryRequest: { partitionKey: string; sortKey: string },
    regionCode: string,
    tableName: string,
    lastEvaluatedKey?: Key,
    client = new DynamoDbClient(regionCode)
) {
    const queryRequestObject = await prepareQueryRequestObject(tableName, regionCode, client, queryRequest)
    queryRequestObject.Limit = await getMaxItemsPerPage()
    queryRequestObject.ExclusiveStartKey = lastEvaluatedKey
    const queryResponse = await client.queryTable(queryRequestObject)
    const { columnNames, tableHeader } = getTableColumnsNames(queryResponse)
    const tableItems = getTableItems(columnNames, queryResponse)

    const tableData: TableData = {
        tableHeader: tableHeader,
        tableContent: tableItems,
        lastEvaluatedKey: queryResponse.LastEvaluatedKey,
    }
    return tableData
}

async function prepareQueryRequestObject(
    tableName: string,
    region: string,
    client: DynamoDbClient,
    request: { partitionKey: string; sortKey: string }
) {
    const tableSchema = await getTableKeySchema(tableName, region, client)
    validateQueryRequest(request, tableSchema)
    const queryRequestObject: DynamoDB.DocumentClient.QueryInput = {
        ExpressionAttributeNames: {
            '#kn0': tableSchema.partitionKey.name,
        },
        ExpressionAttributeValues: {
            ':kv0': getExpressionAttributeValue(request.partitionKey, tableSchema),
        },
        KeyConditionExpression: '#kn0 = :kv0',
        TableName: tableName,
    }

    if (request.sortKey && request.sortKey.length > 0 && tableSchema.sortKey) {
        ;(queryRequestObject.ExpressionAttributeNames as any)['#kn1'] = tableSchema.sortKey.name
        ;(queryRequestObject.ExpressionAttributeValues as any)[':kv1'] = getExpressionAttributeValue(
            request.sortKey,
            tableSchema
        )
        queryRequestObject.KeyConditionExpression += ' AND #kn1 = :kv1'
    }
    return queryRequestObject
}

function getExpressionAttributeValue(value: string, tableSchema: TableSchema) {
    if (tableSchema.partitionKey.dataType === 'S') {
        return { S: value }
    }
    if (tableSchema.partitionKey.dataType === 'N') {
        return { N: value }
    }
    throw new Error('Unsupported data type')
}

function validateQueryRequest(queryRequest: { partitionKey: string; sortKey: string }, tableSchema: TableSchema) {
    if (!queryRequest.partitionKey || queryRequest.partitionKey.length === 0) {
        throw new Error('Partition key cannot be empty for query')
    }
    if (
        (tableSchema.partitionKey.dataType === 'S' && typeof queryRequest.partitionKey !== 'string') ||
        (tableSchema.partitionKey.dataType === 'N' && isNaN(Number(queryRequest.partitionKey))) ||
        (tableSchema.sortKey?.dataType === 'S' && typeof queryRequest.sortKey !== 'string') ||
        (tableSchema.sortKey?.dataType === 'N' && isNaN(Number(queryRequest.sortKey)))
    ) {
        throw new Error('Data type of query input does not match with table schema.')
    }
}

export async function getTableKeySchema(
    tableName: string,
    regionCode: string,
    client = new DynamoDbClient(regionCode)
) {
    const tableSchema: TableSchema = {
        partitionKey: { name: '', dataType: '' },
    }
    const tableInformation = await client.getTableInformation({ TableName: tableName })
    const keySchema = tableInformation.KeySchema
    const attributeDefinitions = tableInformation.AttributeDefinitions
    if (keySchema === undefined || attributeDefinitions === undefined) {
        return tableSchema
    }
    keySchema.forEach((key) => {
        const attributeName = key.AttributeName
        const keyType = key.KeyType // HASH or RANGE
        const attribute = attributeDefinitions.find((attr) => attr.AttributeName === attributeName)
        const attributeType = attribute ? attribute.AttributeType : 'Unknown'

        if (keyType === 'HASH') {
            tableSchema.partitionKey = {
                name: attributeName,
                dataType: attributeType,
            }
        } else if (keyType === 'RANGE') {
            tableSchema.sortKey = {
                name: attributeName,
                dataType: attributeType,
            }
        }
    })
    return tableSchema
}

export function getAttributeValue(attribute: AttributeValue): { key: string; value: any } | undefined {
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

export async function deleteItem(
    tableName: string,
    selectedRow: RowData,
    tableSchema: TableSchema,
    regionCode: string,
    client = new DynamoDbClient(regionCode)
) {
    const partitionKeyName = tableSchema.partitionKey.name
    const partitionKeyValue = selectedRow[partitionKeyName]

    const deleteRequest: DynamoDB.DocumentClient.DeleteItemInput = {
        TableName: tableName,
        Key: {
            [partitionKeyName]: {
                S: partitionKeyValue,
            } as any,
        },
    }
    if (tableSchema.sortKey) {
        const sortKeyName = tableSchema.sortKey.name
        const sortKeyValue = selectedRow[sortKeyName]
        deleteRequest.Key[sortKeyName] = { S: sortKeyValue } as any
    }
    return await client.deleteItem(deleteRequest)
}

async function getMaxItemsPerPage(): Promise<number> {
    return Settings.instance.getSection('aws').get<number>('dynamodb.maxItemsPerPage', 100)
}

export function dynamoDbConsoleUrl(node: DynamoDbTableNode): vscode.Uri {
    const service = 'dynamodb'
    const resourcePath = `tables:selected=${node.dynamoDbtable}`
    return vscode.Uri.parse(`https://console.aws.amazon.com/${service}/home?region=${node.regionCode}#/${resourcePath}`)
}
