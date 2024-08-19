/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
import { ExtContext } from '../../../shared'
import { VueWebview } from '../../../webviews/main'
import { openSettings } from '../../../shared/settings'
import { getLogger, Logger } from '../../../shared/logger'
import { Key, ScanInput } from 'aws-sdk/clients/dynamodb'
import * as localizedText from '../../../shared/localizedText'
import { copyToClipboard, showConfirmationMessage } from '../../../shared/utilities/messages'
import { DynamoDbTarget, telemetry } from '../../../shared/telemetry/telemetry'
import {
    getTableContent,
    queryTableContent,
    RowData,
    TableData,
    getTableKeySchema,
    deleteItem,
    TableSchema,
} from '../utils/dynamodb'
import { editItem } from '../utils/editItem'

const localize = nls.loadMessageBundle()

export interface DynamoDbTableData {
    tableName: string
    region: string
    currentPage: number
    tableContent: RowData[]
    tableHeader: RowData[]
    lastEvaluatedKey?: Key
}

/**
 * The DynamoDbTableWebview class extends the VueWebview class to create a web view for displaying and interacting with a DynamoDB table in a Vue.js application.
 * This class binds the JavaScript and service methods for handling DynamoDB operations.
 */
export class DynamoDbTableWebview extends VueWebview {
    public static readonly sourcePath: string = 'src/awsService/dynamoDb/vue/index.js'
    public readonly id = 'dynamoDbTableView'

    public constructor(private readonly data: DynamoDbTableData) {
        super(DynamoDbTableWebview.sourcePath)
    }

    public init() {
        telemetry.dynamodb_view.emit({ dynamoDbTarget: this.data.tableName as DynamoDbTarget })
        return this.data
    }

    /**
     * Fetches a page of data from the DynamoDB table.
     * @param {Key} [lastEvaluatedKey] - The key to start scanning from.
     * @returns {DynamoDbTableData} The response object containing the scanned data.
     */
    public async fetchPageData(tableSchema: TableSchema, lastEvaluatedKey?: Key) {
        return telemetry.dynamodb_fetchRecords.run(async (span) => {
            const tableRequest: ScanInput = {
                TableName: this.data.tableName,
                ExclusiveStartKey: lastEvaluatedKey,
            }
            try {
                const response = await getDynamoDbTableData(tableRequest, this.data.region, tableSchema)
                span.emit({ dynamoDbFetchType: 'scan', result: 'Succeeded' })
                return response
            } catch (err) {
                span.emit({ dynamoDbFetchType: 'scan', result: 'Failed' })
                getLogger().error(`Failed to fetch the page data ${err}`)
            }
        })
    }

    public async queryData(
        queryRequest: { partitionKey: string; sortKey: string },
        tableSchema: TableSchema,
        lastEvaluatedKey?: Key
    ) {
        return telemetry.dynamodb_fetchRecords.run(async (span) => {
            try {
                const tableData: TableData = await queryTableContent(
                    queryRequest,
                    this.data.region,
                    this.data.tableName,
                    tableSchema,
                    lastEvaluatedKey
                )
                span.emit({ dynamoDbFetchType: 'query', result: 'Succeeded' })

                const response = {
                    tableName: this.data.tableName,
                    region: this.data.region,
                    currentPage: this.data.currentPage,
                    tableHeader: tableData.tableHeader,
                    tableContent: tableData.tableContent,
                    lastEvaluatedKey: tableData.lastEvaluatedKey,
                }
                return response
            } catch (err) {
                span.emit({ dynamoDbFetchType: 'query', result: 'Failed' })
                getLogger().error(`Failed to query the page data ${err}`)
            }
        })
    }

    public async getTableSchema() {
        return await getTableKeySchema(this.data.tableName, this.data.region)
    }

    public async copyCell(selectedCell: string) {
        if (selectedCell !== '') {
            await copyToClipboard(JSON.stringify(selectedCell), 'TableCell')
        }
    }

    public async copyRow(selectedRow: RowData) {
        if (selectedRow !== undefined) {
            await copyToClipboard(JSON.stringify(selectedRow), 'TableItem')
        }
    }

    public async deleteItem(selectedRow: RowData, tableSchema: TableSchema) {
        const isConfirmed = await showConfirmationMessage({
            prompt: localize(
                'AWS.dynamoDb.deleteItem.prompt',
                'Are you sure you want to delete the item with partition key: {0}?',
                selectedRow[tableSchema.partitionKey.name]
            ),
            confirm: localizedText.localizedDelete,
            cancel: localizedText.cancel,
        })

        if (!isConfirmed) {
            getLogger().debug(`Delete action cancelled on DynamoDB Item`)
            return
        }

        if (selectedRow === undefined || tableSchema === undefined) {
            throw new Error('Invalid row, failed to delete the item.')
        }
        try {
            await deleteItem(this.data.tableName, selectedRow, tableSchema, this.data.region)
            return this.fetchPageData(tableSchema, this.data.lastEvaluatedKey)
        } catch (err) {
            getLogger().error(`Delete action failed on DynamoDB Item`)
            return undefined
        }
    }

    public async openPageSizeSettings() {
        await openSettings('aws.dynamoDb.maxItemsPerPage')
    }

    public async editItem(selectedRow: RowData, tableSchema: TableSchema) {
        await editItem(selectedRow, {
            tableName: this.data.tableName,
            regionCode: this.data.region,
            tableSchema: tableSchema,
        })
    }
}

const Panel = VueWebview.compilePanel(DynamoDbTableWebview)
const activePanels = new Map<string, InstanceType<typeof Panel>>()

/**
 * Takes extension-scoped, dynamodb table name and region code. It fetches the dynamodb table items and create a new vscode web view panel. If the panel already exists it will return that panel.
 */
export async function viewDynamoDbTable(context: ExtContext, node: { dynamoDbtable: string; regionCode: string }) {
    const logger: Logger = getLogger()
    await telemetry.dynamodb_openTable.run(async (span) => {
        try {
            const tableSchema = await getTableKeySchema(node.dynamoDbtable, node.regionCode)
            const response = await getDynamoDbTableData({ TableName: node.dynamoDbtable }, node.regionCode, tableSchema)
            span.emit({ result: 'Succeeded' })
            const webViewPanel = activePanels.get(node.dynamoDbtable) ?? new Panel(context.extensionContext, response)
            if (!activePanels.has(node.dynamoDbtable)) {
                activePanels.set(node.dynamoDbtable, webViewPanel)
            }
            const webview = await webViewPanel.show({
                title: localize('AWS.dynamoDb.viewTable.title', node.dynamoDbtable),
                retainContextWhenHidden: true,
            })
            webview.onDidDispose(() => {
                activePanels.delete(node.dynamoDbtable)
            })
        } catch (err) {
            const error = err as Error
            span.emit({ result: 'Failed', reason: `${error.message}` })
            logger.error('Error loading the table: %s', error)
        }
    })
}

export async function getDynamoDbTableData(
    tableRequest: ScanInput,
    regionCode: string,
    tableSchema: TableSchema,
    currentPage: number = 1
) {
    const tableData: TableData = await getTableContent(tableRequest, regionCode, tableSchema)
    const response: DynamoDbTableData = {
        tableName: tableRequest.TableName,
        region: regionCode,
        currentPage: currentPage,
        tableHeader: tableData.tableHeader,
        tableContent: tableData.tableContent,
        lastEvaluatedKey: tableData.lastEvaluatedKey,
    }
    return response
}
