/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
import { ExtContext } from '../../shared'
import { VueWebview } from '../../webviews/main'
import { getLogger, Logger } from '../../shared/logger'
import { telemetry } from '../../shared/telemetry/telemetry'
import { DynamoDbTableNode } from '../explorer/dynamoDbTableNode'
import { getTableContent, RowData, TableData } from '../utils/dynamodbUtils'
import { Key, ScanInput } from 'aws-sdk/clients/dynamodb'

const localize = nls.loadMessageBundle()

interface DynamoDbTableData {
    TableName: string
    Region: string
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
        telemetry.schemas_view.emit({ result: 'Succeeded' })
        return this.data
    }

    public async fetchPageData(currentPage = 1, lastEvaluatedKey = undefined) {
        const tableRequest: ScanInput = {
            TableName: this.data.TableName,
            Limit: 5,
            ExclusiveStartKey: lastEvaluatedKey,
        }
        const response = await getDynamoDbTableData(tableRequest, this.data.Region)
        response.currentPage = currentPage
        return response
    }
}

const Panel = VueWebview.compilePanel(DynamoDbTableWebview)

export async function viewDynamoDbTable(context: ExtContext, node: DynamoDbTableNode) {
    const logger: Logger = getLogger()

    try {
        const response = await getDynamoDbTableData({ TableName: node.dynamoDbtable, Limit: 5 }, node.regionCode)
        const wv = new Panel(context.extensionContext, response)
        await wv.show({
            title: localize('AWS.dynamoDb.viewTable.title', node.dynamoDbtable),
        })
    } catch (err) {
        const error = err as Error
        logger.error('Error loading the table: %s', error)
    }
}

export async function getDynamoDbTableData(tableRequest: ScanInput, regionCode: string) {
    const tableData: TableData = await getTableContent(tableRequest, regionCode)
    const response: DynamoDbTableData = {
        TableName: tableRequest.TableName,
        Region: regionCode,
        currentPage: 1,
        tableHeader: tableData.tableHeader,
        tableContent: tableData.tableContent,
        lastEvaluatedKey: tableData.lastEvaluatedKey,
    }
    return response
}
