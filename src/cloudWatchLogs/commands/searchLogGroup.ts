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
} from '../registry/logStreamRegistry'
import { DataQuickPickItem } from '../../shared/ui/pickerPrompter'
import { Wizard } from '../../shared/wizards/wizard'
import { createInputBox } from '../../shared/ui/inputPrompter'
import { createURIFromArgs } from '../cloudWatchLogsUtils'
import { DefaultCloudWatchLogsClient } from '../../shared/clients/cloudWatchLogsClient'
import { CloudWatchLogs } from 'aws-sdk'
import { LogGroupNode } from '../explorer/logGroupNode'
import { RegionSubmenu, RegionSubmenuResponse } from '../../shared/ui/common/regionSubmenu'
import { highlightDocument } from '../document/logStreamDocumentProvider'

function handleWizardResponse(response: SearchLogGroupWizardResponse, registry: LogStreamRegistry) {
    const logGroupInfo = {
        groupName: response.submenuResponse.data,
        regionName: response.submenuResponse.region,
    }

    const parameters = {
        limit: registry.configuration.get('limit', 10000),
        filterPattern: response.filterPattern,
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

async function prepareDocument(uri: vscode.Uri, registry: LogStreamRegistry) {
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
}

export async function searchLogGroup(node: LogGroupNode | undefined, registry: LogStreamRegistry): Promise<void> {
    let result: telemetry.Result = 'Succeeded'
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

    if (response) {
        const initialStreamData = handleWizardResponse(response, registry)

        const uri = createURIFromArgs(initialStreamData.logGroupInfo, initialStreamData.parameters)

        await registry.registerLog(uri, initialStreamData)
        await prepareDocument(uri, registry)
    } else {
        result = 'Cancelled'
    }
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

export function createFilterpatternPrompter() {
    return createInputBox({
        title: 'Keyword Search',
        placeholder: 'Enter text here',
    })
}

export function createRegionSubmenu() {
    return new RegionSubmenu(getLogGroupsFromRegion)
}

export interface SearchLogGroupWizardResponse {
    submenuResponse: RegionSubmenuResponse<string>
    filterPattern: string
}

export class SearchLogGroupWizard extends Wizard<SearchLogGroupWizardResponse> {
    public constructor(logGroupInfo?: CloudWatchLogsGroupInfo) {
        logGroupInfo
            ? super({
                  initState: {
                      submenuResponse: {
                          data: logGroupInfo.groupName,
                          region: logGroupInfo.regionName,
                      },
                  },
              })
            : super()

        this.form.submenuResponse.bindPrompter(createRegionSubmenu)
        this.form.filterPattern.bindPrompter(createFilterpatternPrompter)
    }
}
