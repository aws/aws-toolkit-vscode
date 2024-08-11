/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import { RowData, TableSchema, getAttributeValue } from './dynamodb'
import { DynamoDbClient } from '../../shared/clients/dynamoDbClient'
import { AttributeUpdates, GetItemInput, GetItemOutput, UpdateItemInput } from 'aws-sdk/clients/dynamodb'
import { telemetry } from '../../shared/telemetry'

export async function editItem(
    selectedRow: RowData,
    { tableName, regionCode, tableSchema }: { tableName: string; regionCode: string; tableSchema: TableSchema }
) {
    const currentContent = JSON.stringify(selectedRow, undefined, 4)
    let filename = `${selectedRow[tableSchema.partitionKey.name]}`
    if (tableSchema.sortKey) {
        filename += `-${selectedRow[tableSchema.sortKey.name]}`
    }
    const tempFilePath = path.join(os.tmpdir(), `${filename}.json`)
    fs.writeFileSync(tempFilePath, currentContent)

    const document = await vscode.workspace.openTextDocument(tempFilePath)
    await vscode.window.showTextDocument(document, { preview: false, viewColumn: vscode.ViewColumn.Beside })

    const saveListener = vscode.workspace.onDidSaveTextDocument(async (savedDoc) => {
        if (savedDoc.fileName === tempFilePath) {
            await saveItem(tempFilePath, selectedRow, { tableName, regionCode, tableSchema })
        }
    })

    const closeListener = vscode.workspace.onDidCloseTextDocument(async (closedDoc) => {
        if (closedDoc.fileName === tempFilePath) {
            await saveItem(tempFilePath, selectedRow, { tableName, regionCode, tableSchema })
            saveListener.dispose()
            closeListener.dispose()
            if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath)
            }
        }
    })
}

async function saveItem(
    tempFilePath: string,
    selectedRow: RowData,
    { tableName, regionCode, tableSchema }: { tableName: string; regionCode: string; tableSchema: TableSchema }
) {
    try {
        const updatedContent = JSON.parse(fs.readFileSync(tempFilePath, 'utf-8'))
        const response = await updateDynamoDbItem(updatedContent, selectedRow, { tableName, regionCode, tableSchema })
        if (response) {
            void vscode.window.showInformationMessage('Item updated successfully in DynamoDB')
        }
    } catch (error) {
        void vscode.window.showErrorMessage(`Failed to update item in DynamoDB: ${(error as any).message}`)
    }
}
async function updateDynamoDbItem(
    updatedItem: RowData,
    currentItem: RowData,
    { tableName, regionCode, tableSchema }: { tableName: string; regionCode: string; tableSchema: TableSchema },
    client: DynamoDbClient = new DynamoDbClient(regionCode)
) {
    const partitionKey = tableSchema.partitionKey.name
    const sortKey = tableSchema.sortKey?.name

    if (updatedItem[partitionKey] !== currentItem[partitionKey]) {
        void vscode.window.showErrorMessage(`Partition key '${partitionKey}' cannot be updated.`)
        return
    }

    if (sortKey && updatedItem[sortKey] !== currentItem[sortKey]) {
        void vscode.window.showErrorMessage(`Sort key '${sortKey}' cannot be updated.`)
        return
    }

    if (!compareRowDataItems(updatedItem, currentItem)) {
        return
    }
    const itemWithDataType: GetItemOutput = await getItem(client, currentItem, tableName, tableSchema)
    const expressionAttributeValues = getExpressionAttributeValues(updatedItem, itemWithDataType, tableSchema)
    const updateRequest: UpdateItemInput = {
        TableName: tableName,
        Key: getKeyObject(currentItem, tableSchema),
        AttributeUpdates: expressionAttributeValues,
    }
    void telemetry.dynamodb_edit.run(async () => {
        telemetry.record({ action: 'user' })
        const response = await client.updateItem(updateRequest)
        if (response) {
            telemetry.record({ action: 'success' })
        }
        return response
    })
    return undefined
}

function getExpressionAttributeValues(updatedItem: RowData, currentItem: GetItemOutput, tableSchema: TableSchema) {
    if (!currentItem.Item) {
        return
    }
    const keys = Object.keys(updatedItem)
    const expressionAttributeValues: AttributeUpdates = {}

    for (const key of keys) {
        const attributeMap = getAttributeValue(currentItem.Item[key])

        if (attributeMap && updatedItem[key] !== attributeMap.value) {
            expressionAttributeValues[key] = {
                Action: 'PUT',
                Value: {
                    [attributeMap.key]: updatedItem[key],
                },
            }
        }
    }
    return expressionAttributeValues
}

function compareRowDataItems(updatedItem: RowData, currentItem: RowData) {
    const keys = Object.keys(updatedItem)
    let isDifferent = false

    for (const key of keys) {
        if (updatedItem[key] !== currentItem[key]) {
            isDifferent = true
            break
        }
    }
    return isDifferent
}

async function getItem(client: DynamoDbClient, selectedRow: RowData, tableName: string, tableSchema: TableSchema) {
    const requestObject: GetItemInput = {
        TableName: tableName,
        Key: getKeyObject(selectedRow, tableSchema),
    }

    return await client.getItem(requestObject)
}

function getKeyObject(selectedRow: RowData, tableSchema: TableSchema) {
    const partitionKeyName = tableSchema.partitionKey.name
    const keyObject: { [key: string]: { [key: string]: string } } = {
        [partitionKeyName]: { [tableSchema.partitionKey.dataType]: selectedRow[partitionKeyName] },
    }

    if (tableSchema.sortKey) {
        const sortKeyName = tableSchema.sortKey.name
        keyObject[sortKeyName] = { [tableSchema.sortKey.dataType]: selectedRow[sortKeyName] }
    }
    return keyObject
}
