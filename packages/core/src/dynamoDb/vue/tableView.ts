/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
import { ExtContext } from '../../shared'
import { VueWebview } from '../../webviews/main'
import { getLogger, Logger } from '../../shared/logger'
import { Key, ScanInput } from 'aws-sdk/clients/dynamodb'
import { DynamoDbTarget, telemetry } from '../../shared/telemetry/telemetry'
import { getTableContent, queryTableContent, RowData, TableData, getTableKeySchema } from '../utils/dynamodb'

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
    public static readonly sourcePath: string = 'src/dynamoDb/vue/index.js'
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
     * @param {number} [currentPage=1] - The current page number.
     * @returns {DynamoDbTableData} The response object containing the scanned data.
     */
    public async fetchPageData(lastEvaluatedKey?: Key, currentPage = 1) {
        const tableRequest: ScanInput = {
            TableName: this.data.tableName,
            Limit: 50,
            ExclusiveStartKey: lastEvaluatedKey,
        }
        const response = await getDynamoDbTableData(tableRequest, this.data.region, currentPage)
        return response
    }

    public async queryData(queryRequest: { partitionKey: string; sortKey: string }) {
        const tableData: TableData = await queryTableContent(queryRequest, this.data.region, this.data.tableName)
        const response = {
            tableName: this.data.tableName,
            region: this.data.region,
            currentPage: this.data.currentPage,
            tableHeader: tableData.tableHeader,
            tableContent: tableData.tableContent,
            lastEvaluatedKey: tableData.lastEvaluatedKey,
        }
        return response
    }

    public async getTableSchema() {
        return await getTableKeySchema(this.data.tableName, this.data.region)
    }
}

const Panel = VueWebview.compilePanel(DynamoDbTableWebview)
const activePanels = new Map<string, InstanceType<typeof Panel>>()

/**
 * Takes extension-scoped, dynamodb table name and region code. It fetches the dynamodb table items and create a new vscode web view panel. If the panel already exists it will return that panel.
 */
export async function viewDynamoDbTable(context: ExtContext, node: { dynamoDbtable: string; regionCode: string }) {
    const logger: Logger = getLogger()

    try {
        const response = await getDynamoDbTableData({ TableName: node.dynamoDbtable, Limit: 50 }, node.regionCode)
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
        logger.error('Error loading the table: %s', error)
    }
}

export async function getDynamoDbTableData(tableRequest: ScanInput, regionCode: string, currentPage: number = 1) {
    const tableData: TableData = await getTableContent(tableRequest, regionCode)
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
