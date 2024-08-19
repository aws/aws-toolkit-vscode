/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
import { Wizard } from '../../shared/wizards/wizard'
import { DataQuickPickItem } from '../../shared/ui/pickerPrompter'
import { DynamoDbClient } from '../../shared/clients/dynamoDbClient'
import { toArrayAsync } from '../../shared/utilities/collectionUtils'
import { CancellationError } from '../../shared/utilities/timeoutUtils'
import { RegionSubmenu, RegionSubmenuResponse } from '../../shared/ui/common/regionSubmenu'
import { ExtContext } from '../../shared/extensions'
import { viewDynamoDbTable } from '../vue/tableView'
import { telemetry } from '../../shared/telemetry'

const localize = nls.loadMessageBundle()

/**
 * Search wizard for DynamoDB tables from command palette.
 */
export async function searchDynamoDbTables(
    context: ExtContext,
    source: string,
    dbData?: { regionName: string }
): Promise<void> {
    await telemetry.dynamodb_openTable.run(async (span) => {
        const wizard = new SearchDynamoDbTablesWizard(dbData)
        span.record({ dynamoDbResourceType: 'table', source: source })
        const response = await wizard.run()
        if (!response) {
            throw new CancellationError('user')
        }
        await viewDynamoDbTable(context, {
            dynamoDbtable: response.submenuResponse.data,
            regionCode: response.submenuResponse.region,
        })
    })
}

export interface SearchDynamoDbTablesWizardResponse {
    submenuResponse: RegionSubmenuResponse<string>
    filterPattern: string
}

/**
 * Creates a submenu for selecting a DynamoDB table from a region.
 */
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
    const options = dynamoDbTables.map<DataQuickPickItem<string>>((tableName) => ({
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
