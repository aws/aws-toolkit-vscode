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
import { DynamoDbTableNode } from '../explorer/dynamoDbTableNode'
import { getTableContent, RowData, TableData } from '../utils/dynamodb'

const localize = nls.loadMessageBundle()

export interface DynamoDbTableData {
    tableName: string
    region: string
    currentPage: number
    tableContent: RowData[]
    tableHeader: RowData[]
    lastEvaluatedKey?: Key
}

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

    public async fetchPageData(lastEvaluatedKey?: Key, currentPage = 1) {
        const tableRequest: ScanInput = {
            TableName: this.data.tableName,
            Limit: 5,
            ExclusiveStartKey: lastEvaluatedKey,
        }
        const response = await getDynamoDbTableData(tableRequest, this.data.region, currentPage)
        return response
    }
}

const Panel = VueWebview.compilePanel(DynamoDbTableWebview)
const activePanels = new Map<string, InstanceType<typeof Panel>>()

export async function viewDynamoDbTable(context: ExtContext, node: DynamoDbTableNode) {
    const logger: Logger = getLogger()

    try {
        const response = await getDynamoDbTableData({ TableName: node.dynamoDbtable, Limit: 5 }, node.regionCode)
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
