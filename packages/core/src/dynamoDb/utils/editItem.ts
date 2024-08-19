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

const openedDocuments: Set<string> = new Set()

export async function editItem(
    selectedRow: RowData,
    { tableName, regionCode, tableSchema }: { tableName: string; regionCode: string; tableSchema: TableSchema },
    client: DynamoDbClient = new DynamoDbClient(regionCode),
    editItemHelper: EditItemHelper = new EditItemHelper(tableName, tableSchema, client)
) {
    const currentItem = await editItemHelper.getCurrentItem(selectedRow)

    let filename = `${selectedRow[tableSchema.partitionKey.name]}`
    if (tableSchema.sortKey) {
        filename += `-${selectedRow[tableSchema.sortKey.name]}`
    }
    const editItemFilePath = path.join(os.tmpdir(), `${filename}.json`)
    fs.writeFileSync(editItemFilePath, JSON.stringify(currentItem, undefined, 4))
    openedDocuments.add(editItemFilePath)

    const document = await vscode.workspace.openTextDocument(editItemFilePath)
    await vscode.window.showTextDocument(document, { preview: false, viewColumn: vscode.ViewColumn.Beside })

    const saveListener = vscode.workspace.onDidSaveTextDocument(async (savedDoc) => {
        if (savedDoc.fileName === editItemFilePath) {
            await saveItem(editItemFilePath, currentItem, editItemHelper)
        }
    })

    const closeListener = vscode.workspace.onDidCloseTextDocument(async (closedDoc) => {
        if (closedDoc.fileName === editItemFilePath) {
            await saveItem(editItemFilePath, currentItem, editItemHelper)
            saveListener.dispose()
            closeListener.dispose()
            if (fs.existsSync(editItemFilePath)) {
                fs.unlinkSync(editItemFilePath)
                openedDocuments.delete(editItemFilePath)
            }
        }
    })
}

async function saveItem(tempFilePath: string, currentItemInfo: RowData, editItemHelper: EditItemHelper) {
    try {
        const updatedContent = JSON.parse(fs.readFileSync(tempFilePath, 'utf-8'))
        const response = await updateDynamoDbItem(updatedContent, currentItemInfo, editItemHelper)
        if (response) {
            void vscode.window.showInformationMessage('Item updated successfully in DynamoDB')
        }
    } catch (error) {
        void vscode.window.showErrorMessage(`Failed to update item in DynamoDB: ${(error as any).message}`)
    }
}

async function updateDynamoDbItem(updatedItem: RowData, currentItem: RowData, editItemHelper: EditItemHelper) {
    const partitionKey = editItemHelper.tableSchema.partitionKey.name
    const sortKey = editItemHelper.tableSchema.sortKey?.name

    if (updatedItem[partitionKey] !== currentItem[partitionKey]) {
        void vscode.window.showErrorMessage(`DynamoDB does not allow updating Partition Key.`)
        return
    }

    if (sortKey && updatedItem[sortKey] !== currentItem[sortKey]) {
        void vscode.window.showErrorMessage(`DynamoDB does not allow updating Sort Key`)
        return
    }

    if (!editItemHelper.compareRowDataItems(updatedItem, currentItem)) {
        return
    }

    const expressionAttributeValues = editItemHelper.getExpressionAttributeValues(updatedItem, currentItem)
    if (!expressionAttributeValues) {
        return
    }

    const updateRequest: UpdateItemInput = {
        TableName: editItemHelper.tableName,
        Key: editItemHelper.getKeyObject(currentItem),
        AttributeUpdates: expressionAttributeValues,
    }

    void telemetry.dynamodb_edit.run(async () => {
        telemetry.record({ action: 'user' })
        try {
            const response = await editItemHelper.client.updateItem(updateRequest)
            telemetry.record({ action: 'success' })
            return response
        } catch (err) {
            void vscode.window.showErrorMessage(`Error occurred while updating the item ${(err as any).message}`)
            telemetry.record({ action: 'failure' })
        }
    })
    return undefined
}

class EditItemHelper {
    private getItemResponse: GetItemOutput | undefined
    public tableName: string
    public tableSchema: TableSchema
    public client: DynamoDbClient

    constructor(tableName: string, tableSchema: TableSchema, client: DynamoDbClient) {
        this.tableName = tableName
        this.tableSchema = tableSchema
        this.client = client
    }

    public async getCurrentItem(selectedRow: RowData): Promise<RowData> {
        const getItemInputRequest: GetItemInput = {
            TableName: this.tableName,
            Key: {
                [this.tableSchema.partitionKey.name]: {
                    [this.tableSchema.partitionKey.dataType]: selectedRow[this.tableSchema.partitionKey.name],
                },
            },
        }

        if (this.tableSchema.sortKey) {
            getItemInputRequest.Key[this.tableSchema.sortKey.name] = {
                [this.tableSchema.sortKey.dataType]: selectedRow[this.tableSchema.sortKey.name],
            }
        }

        const response = await this.client.getItem(getItemInputRequest)
        this.getItemResponse = response

        const currentItem: RowData = {}

        if (!response.Item) {
            return currentItem
        }

        for (const [key, value] of Object.entries(response.Item)) {
            const attributeValue = getAttributeValue(value)
            currentItem[key] = attributeValue?.value ?? ''
        }

        return currentItem
    }

    public getExpressionAttributeValues(updatedItem: RowData, currentItem: RowData) {
        const uniqueKeys = new Set([...Object.keys(updatedItem), ...Object.keys(currentItem)])
        const expressionAttributeValues: AttributeUpdates = {}

        for (const key of uniqueKeys) {
            if (!(key in updatedItem)) {
                // a key is not present in updateItem, it is deleted.
                expressionAttributeValues[key] = {
                    Action: 'DELETE',
                }
                continue
            } else if (!(key in currentItem)) {
                // a key is not present in currentItem, it is added.
                void vscode.window.showErrorMessage(
                    'Addition of new attributes is not supported here. Please use AWS console.'
                )
                return undefined
            }
            if (!this.getItemResponse || !this.getItemResponse?.Item) {
                return undefined
            }
            const attributeMap = getAttributeValue(this.getItemResponse.Item[key])

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

    /**
     * Compares two row data items to check for differences.
     * Iterates through the keys of the updated item and compares the values
     * with the corresponding keys in the current item. If any key is missing
     * in the current item or if the values do not match, it returns `true`,
     * indicating that the items are different. If all values match, it returns `false`.
     * @param updatedItem - The object representing the updated row data.
     * @param currentItem - The object representing the current row data.
     * @param tableSchema - The schema of the DynamoDB table, defining key attributes and data types.
     * @returns {boolean} - Returns `true` if there are differences between the two items, otherwise `false`.
     */
    public compareRowDataItems(updatedItem: RowData, currentItem: RowData) {
        const existingKeys = Object.keys(currentItem)
        for (const key of existingKeys) {
            if (!(key in updatedItem) || updatedItem[key] !== currentItem[key]) {
                return true
            }
        }

        const newKeys = Object.keys(updatedItem)
        for (const key of newKeys) {
            if (!(key in currentItem) || updatedItem[key] !== currentItem[key]) {
                void vscode.window.showErrorMessage(
                    'Addition of new attributes is not supported here. Please use AWS console.'
                )
                return false // To avoid further processing
            }
        }
        return false
    }

    public getKeyObject(currentItem: RowData) {
        const partitionKeyName = this.tableSchema.partitionKey.name
        const keyObject: { [key: string]: { [key: string]: string } } = {
            [partitionKeyName]: { [this.tableSchema.partitionKey.dataType]: currentItem[partitionKeyName] },
        }

        if (this.tableSchema.sortKey) {
            const sortKeyName = this.tableSchema.sortKey.name
            keyObject[sortKeyName] = { [this.tableSchema.sortKey.dataType]: currentItem[sortKeyName] }
        }
        return keyObject
    }
}
