/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { telemetry, Result } from '../../shared/telemetry/telemetry'
import {
    CloudWatchLogsData,
    CloudWatchLogsGroupInfo,
    LogDataRegistry,
    filterLogEventsFromUriComponents,
    CloudWatchLogsParameters,
    getInitialLogData,
} from '../registry/logDataRegistry'
import { DataQuickPickItem } from '../../shared/ui/pickerPrompter'
import { Wizard } from '../../shared/wizards/wizard'
import { createURIFromArgs, parseCloudWatchLogsUri, recordTelemetryFilter } from '../cloudWatchLogsUtils'
import { DefaultCloudWatchLogsClient } from '../../shared/clients/cloudWatchLogsClient'
import { CancellationError } from '../../shared/utilities/timeoutUtils'
import { getLogger } from '../../shared/logger'
import { TimeFilterResponse, TimeFilterSubmenu } from '../timeFilterSubmenu'
import { LogGroupNode } from '../explorer/logGroupNode'
import { CloudWatchLogs } from 'aws-sdk'
import { createInputBox, InputBoxPrompter } from '../../shared/ui/inputPrompter'
import { RegionSubmenu, RegionSubmenuResponse } from '../../shared/ui/common/regionSubmenu'
import { truncate } from '../../shared/utilities/textUtilities'
import { createBackButton, createExitButton, createHelpButton } from '../../shared/ui/buttons'

const localize = nls.loadMessageBundle()

function handleWizardResponse(response: SearchLogGroupWizardResponse, registry: LogDataRegistry): CloudWatchLogsData {
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

    const initialStreamData = getInitialLogData(logGroupInfo, parameters, filterLogEventsFromUriComponents)

    if (initialStreamData.parameters.startTime || initialStreamData.parameters.filterPattern) {
        recordTelemetryFilter(initialStreamData, 'logGroup', 'Command')
    }

    return initialStreamData
}

export async function prepareDocument(
    uri: vscode.Uri,
    initialLogData: CloudWatchLogsData,
    registry: LogDataRegistry
): Promise<Result> {
    try {
        await registry.registerLog(uri, initialLogData)
        const doc = await vscode.workspace.openTextDocument(uri) // calls back into the provider
        vscode.languages.setTextDocumentLanguage(doc, 'log')

        const textEditor = await vscode.window.showTextDocument(doc, { preview: false })
        registry.setTextEditor(uri, textEditor)

        // Initial highlighting of the document and then for any addLogEvent calls.
        registry.highlightDocument(uri)
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

export async function searchLogGroup(node: LogGroupNode | undefined, registry: LogDataRegistry): Promise<void> {
    let response: SearchLogGroupWizardResponse | undefined
    let result: Result
    let source: 'Explorer' | 'Command'

    if (node) {
        source = 'Explorer'
        if (!node.logGroup.logGroupName) {
            throw new Error('CWL: Log Group node does not have a name.')
        }

        response = await new SearchLogGroupWizard({
            groupName: node.logGroup.logGroupName,
            regionName: node.regionCode,
        }).run()
    } else {
        source = 'Command'
        response = await new SearchLogGroupWizard().run()
    }

    if (!response) {
        result = 'Cancelled'
        telemetry.cloudwatchlogs_open.emit({ result: result, cloudWatchResourceType: 'logGroup', source: source })
        return
    }

    const initialLogData = handleWizardResponse(response, registry)

    const uri = createURIFromArgs(initialLogData.logGroupInfo, initialLogData.parameters)

    result = await prepareDocument(uri, initialLogData, registry)
    telemetry.cloudwatchlogs_open.emit({ result: result, cloudWatchResourceType: 'logGroup', source: source })
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

export function createFilterpatternPrompter(logGroupName: string, isFirst: boolean): InputBoxPrompter {
    const helpUri =
        'https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/FilterAndPatternSyntax.html#matching-terms-events'
    const titleText = localize(
        'AWS.cwl.searchLogGroup.filterPatternTitle',
        `Search Log Group {0}`,
        truncate(logGroupName, -50)
    )
    const placeHolderText = localize(
        'AWS.cwl.searchLogGroup.filterPatternPlaceholder',
        'search pattern (or empty for all events)'
    )
    const options = {
        title: titleText,
        placeholder: placeHolderText,
        buttons: [createHelpButton(helpUri), createExitButton()],
    }

    if (!isFirst) {
        options.buttons = [...options.buttons, createBackButton()]
    }

    return createInputBox(options)
}

export function createRegionSubmenu() {
    return new RegionSubmenu(
        getLogGroupsFromRegion,
        { title: localize('AWS.cwl.searchLogGroup.logGroupPromptTitle', 'Select Log Group') },
        { title: localize('AWS.cwl.searchLogGroup.regionPromptTitle', 'Select Region for Log Group') }
    )
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
        this.form.filterPattern.bindPrompter(({ submenuResponse }) =>
            createFilterpatternPrompter(submenuResponse!.data, logGroupInfo ? true : false)
        )
        this.form.timeRange.bindPrompter(() => new TimeFilterSubmenu())
    }
}
