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

const localize = nls.loadMessageBundle()

interface DynamoDbTableData {
    TableName: string
    Region: string
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
}

const Panel = VueWebview.compilePanel(DynamoDbTableWebview)

export async function viewDynamoDbTable(context: ExtContext, node: DynamoDbTableNode) {
    const logger: Logger = getLogger()

    try {
        const wv = new Panel(context.extensionContext, {
            TableName: node.dynamoDbtable,
            Region: node.regionCode,
        })
        await wv.show({
            title: localize('AWS.dynamoDb.viewTable.title', node.dynamoDbtable),
        })
    } catch (err) {
        const error = err as Error
        logger.error('Error loading the table: %s', error)
    }
}
