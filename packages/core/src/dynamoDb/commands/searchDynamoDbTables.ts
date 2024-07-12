/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import fs from '../../shared/fs/fs'
import DynamoDB from 'aws-sdk/clients/dynamodb'
import { Wizard } from '../../shared/wizards/wizard'
import { telemetry } from '../../shared/telemetry/telemetry'
import { DataQuickPickItem } from '../../shared/ui/pickerPrompter'
import { DynamoDbClient } from '../../shared/clients/dynamoDbClient'
import { toArrayAsync } from '../../shared/utilities/collectionUtils'
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

        // This is a temporary change
        const output = `${JSON.stringify(tableOutput.Items, undefined, 4)}\n`
        const filePath = process.env['HOME'] + '/Documents/dynamoDbItems.json'
        await fs.writeFile(filePath, output)
        const uri = vscode.Uri.parse(filePath)
        await prepareDocument(uri)
    })
}

export async function prepareDocument(uri: vscode.Uri) {
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
        { title: localize('AWS.dynamoDb.searchTables.TableTitle', 'Select a table') },
        { title: localize('AWS.dynamoDb.searchTables.regionPromptTitle', 'Select Region for DynamoDb') },
        'DynamoDb Tables'
    )
}

async function getTablesFromRegion(regionCode: string): Promise<DataQuickPickItem<string>[]> {
    const client = new DynamoDbClient(regionCode)
    const dynamoDbTables = await dynamoDbTablesToArray(client.getTables())
    const options = dynamoDbTables.map<DataQuickPickItem<string>>(tableName => ({
        label: tableName,
        data: tableName,
    }))
    return options
}

async function dynamoDbTablesToArray(dynamoDbTables: AsyncIterableIterator<string>): Promise<string[]> {
    const tablesArray = []
    const tables = await toArrayAsync(dynamoDbTables)
    tables.sort((a, b) => a.localeCompare(b))

    for await (const tableObject of tables) {
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
