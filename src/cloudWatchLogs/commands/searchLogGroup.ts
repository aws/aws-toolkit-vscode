/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as telemetry from '../../shared/telemetry/telemetry'
import {
    CloudWatchLogsData,
    CloudWatchLogsGroupInfo,
    LogStreamRegistry,
    filterLogEventsFromUriComponents,
    CloudWatchLogsParameters,
} from '../registry/logStreamRegistry'
import { DataQuickPickItem } from '../../shared/ui/pickerPrompter'
import { Wizard } from '../../shared/wizards/wizard'
import { createURIFromArgs, parseCloudWatchLogsUri } from '../cloudWatchLogsUtils'
import { DefaultCloudWatchLogsClient } from '../../shared/clients/cloudWatchLogsClient'
import { highlightDocument } from '../document/logStreamDocumentProvider'
import { CancellationError } from '../../shared/utilities/timeoutUtils'
import { localize } from 'vscode-nls'
import { getLogger } from '../../shared/logger'
import { TimeFilterResponse, TimeFilterSubmenu } from '../timeFilterSubmenu'
import { LogGroupNode } from '../explorer/logGroupNode'
import { CloudWatchLogs } from 'aws-sdk'
import { createInputBox } from '../../shared/ui/inputPrompter'
import { RegionSubmenu, RegionSubmenuResponse } from '../../shared/ui/common/regionSubmenu'
import { truncate } from '../../shared/utilities/textUtilities'

function handleWizardResponse(response: SearchLogGroupWizardResponse, registry: LogStreamRegistry): CloudWatchLogsData {
    const logGroupInfo: CloudWatchLogsGroupInfo = {
        groupName: response.submenuResponse.data,
        regionName: response.submenuResponse.region,
    }
    let parameters: CloudWatchLogsParameters
    const limitParam = registry.configuration.get('limit', 10000)

    if (response.timeRange.start === response.timeRange.end) {
        // this means no time filter.
        parameters = {
            limit: limitParam,
            filterPattern: response.filterPattern,
        }
    } else {
        parameters = {
            limit: limitParam,
            filterPattern: response.filterPattern,
            startTime: response.timeRange.start,
            endTime: response.timeRange.end,
        }
    }

    const initialStreamData: CloudWatchLogsData = {
        data: [],
        parameters: parameters,
        busy: false,
        logGroupInfo: logGroupInfo,
        retrieveLogsFunction: filterLogEventsFromUriComponents,
    }

    return initialStreamData
}

export async function prepareDocument(uri: vscode.Uri, registry: LogStreamRegistry): Promise<telemetry.Result> {
    try {
        const doc = await vscode.workspace.openTextDocument(uri) // calls back into the provider
        vscode.languages.setTextDocumentLanguage(doc, 'log')

        const textEditor = await vscode.window.showTextDocument(doc, { preview: false })
        registry.setTextEditor(uri, textEditor)

        // Initial highlighting of the document and then for any addLogEvent calls.
        highlightDocument(registry, uri)
        vscode.workspace.onDidChangeTextDocument((event: vscode.TextDocumentChangeEvent) => {
            if (event.document.uri.toString() === doc.uri.toString()) {
                highlightDocument(registry, uri)
            }
        })
        return 'Succeeded'
    } catch (err) {
        if (CancellationError.isUserCancelled(err)) {
            getLogger().debug('cwl: User Cancelled Search')
            return 'Cancelled'
        } else {
            const error = err as Error
            vscode.window.showErrorMessage(
                localize(
                    'AWS.cwl.searchLogGroup.errorRetrievingLogs',
                    'Error retrieving logs for Log Group {0} : {1}',
                    parseCloudWatchLogsUri(uri).logGroupInfo.groupName,
                    error.message
                )
            )
            return 'Failed'
        }
    }
}

export async function searchLogGroup(node: LogGroupNode | undefined, registry: LogStreamRegistry): Promise<void> {
    let response: SearchLogGroupWizardResponse | undefined

    if (node) {
        if (!node.logGroup.logGroupName) {
            throw new Error('CWL: Log Group node does not have a name.')
        }

        response = await new SearchLogGroupWizard({
            groupName: node.logGroup.logGroupName,
            regionName: node.regionCode,
        }).run()
    } else {
        response = await new SearchLogGroupWizard().run()
    }

    if (!response) {
        telemetry.recordCloudwatchlogsOpenStream({ result: 'Cancelled' })
        return
    }

    const initialLogData = handleWizardResponse(response, registry)

    const uri = createURIFromArgs(initialLogData.logGroupInfo, initialLogData.parameters)

    await registry.registerLog(uri, initialLogData)

    const result = await prepareDocument(uri, registry)
    telemetry.recordCloudwatchlogsOpenStream({ result })
}

async function getLogGroupsFromRegion(regionCode: string): Promise<DataQuickPickItem<string>[]> {
    const client = new DefaultCloudWatchLogsClient(regionCode)
    const logGroups = await logGroupsToArray(client.describeLogGroups())
    const options = logGroups.map<DataQuickPickItem<string>>(logGroupString => ({
        label: logGroupString,
        data: logGroupString,
    }))
    return options
}

async function logGroupsToArray(logGroups: AsyncIterableIterator<CloudWatchLogs.LogGroup>): Promise<string[]> {
    const logGroupsArray = []
    for await (const logGroupObject of logGroups) {
        logGroupObject.logGroupName && logGroupsArray.push(logGroupObject.logGroupName)
    }
    return logGroupsArray
}

export function createFilterpatternPrompter(logGroupName: string) {
    return createInputBox({
        title: `Search Log Group ${truncate(logGroupName, -50)}`,
        placeholder: 'search pattern',
    })
}

export function createRegionSubmenu() {
    return new RegionSubmenu(getLogGroupsFromRegion)
}

export interface SearchLogGroupWizardResponse {
    submenuResponse: RegionSubmenuResponse<string>
    filterPattern: string
    timeRange: TimeFilterResponse
}

export class SearchLogGroupWizard extends Wizard<SearchLogGroupWizardResponse> {
    public constructor(logGroupInfo?: CloudWatchLogsGroupInfo) {
        super({
            initState: {
                submenuResponse: logGroupInfo
                    ? {
                          data: logGroupInfo.groupName,
                          region: logGroupInfo.regionName,
                      }
                    : undefined,
            },
        })

        this.form.submenuResponse.bindPrompter(createRegionSubmenu)
        this.form.filterPattern.bindPrompter(() => createFilterpatternPrompter(logGroupInfo?.groupName ?? ''))
        this.form.timeRange.bindPrompter(() => new TimeFilterSubmenu())
    }
}
