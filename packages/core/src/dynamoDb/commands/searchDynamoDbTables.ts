/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { Wizard } from '../../shared/wizards/wizard'
import DynamoDB, { TableNameList } from 'aws-sdk/clients/dynamodb'
import { telemetry } from '../../shared/telemetry/telemetry'
import { DataQuickPickItem } from '../../shared/ui/pickerPrompter'
import { DynamoDbClient } from '../../shared/clients/dynamoDbClient'
import { CancellationError } from '../../shared/utilities/timeoutUtils'
import { RegionSubmenu, RegionSubmenuResponse } from '../../shared/ui/common/regionSubmenu'

const localize = nls.loadMessageBundle()

/**
 * "Search DynamoDb Tables Command"
 *
 */
export async function searchDynamoDbTables(source: string, dbData?: { regionName: string }): Promise<void> {
    await telemetry.dynamodb_openTable.run(async span => {
        const wizard = new SearchDynamoDbTablesWizard(dbData)
        span.record({ dynamoDbResourceType: 'table', source: source })
        const response = await wizard.run()
        if (!response) {
            throw new CancellationError('user')
        }
        const tableOutput = await getItemsFromTable(response.submenuResponse.region, response.submenuResponse.data)
        const uri = vscode.Uri.parse('us-east-1:LogGroup1')
        await prepareDocument(uri, tableOutput)
    })
}

export async function prepareDocument(uri: vscode.Uri, logData: DynamoDB.ScanOutput) {
    try {
        const doc = await vscode.workspace.openTextDocument(uri)
        await vscode.window.showTextDocument(doc, { preview: false })
        await vscode.languages.setTextDocumentLanguage(doc, 'json')
    } catch (err) {
        if (CancellationError.isUserCancelled(err)) {
            throw err
        }
    }
}

export interface SearchDynamoDbTablesWizardResponse {
    submenuResponse: RegionSubmenuResponse<string>
    filterPattern: string
}

export function createRegionSubmenu() {
    return new RegionSubmenu(
        getTablesFromRegion,
        { title: localize('AWS.dynamoDb.searchDynamoDbTables.TableTitle', 'Select a table') },
        { title: localize('AWS.dynamoDb.searchDynamoDbTables.regionPromptTitle', 'Select Region for DynamoDb') },
        'DynamoDb Tables'
    )
}

async function getTablesFromRegion(regionCode: string): Promise<DataQuickPickItem<string>[]> {
    const client = new DynamoDbClient(regionCode)
    const dynamoDbTables = await dynamoDbTablesToArray(await client.getTables())
    const options = dynamoDbTables.map<DataQuickPickItem<string>>(tableName => ({
        label: tableName,
        data: tableName,
    }))
    return options
}

async function dynamoDbTablesToArray(dynamoDbTables: TableNameList): Promise<string[]> {
    const tablesArray = []
    dynamoDbTables.sort((a, b) => a.localeCompare(b))

    for await (const tableObject of dynamoDbTables) {
        tableObject && tablesArray.push(tableObject)
    }
    return tablesArray
}

async function getItemsFromTable(regionCode: string, tableName: string): Promise<DynamoDB.ScanOutput> {
    const client = new DynamoDbClient(regionCode)
    const tableInfo = await client.scanTable({ TableName: tableName })
    return tableInfo
}

export class SearchDynamoDbTablesWizard extends Wizard<SearchDynamoDbTablesWizardResponse> {
    public constructor(dbData?: { regionName: string }) {
        super({
            initState: {
                submenuResponse: dbData
                    ? {
                          data: dbData.regionName,
                          region: dbData.regionName,
                      }
                    : undefined,
            },
        })
        this.form.submenuResponse.bindPrompter(createRegionSubmenu)
    }
}
