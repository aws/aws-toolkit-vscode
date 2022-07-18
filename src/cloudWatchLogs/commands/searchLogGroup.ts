/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as telemetry from '../../shared/telemetry/telemetry'
import {
    CloudWatchLogsData,
    CloudWatchLogsGroupInfo,
    CloudWatchLogsParameters,
    LogStreamRegistry,
    filterLogEventsFromUriComponents,
} from '../registry/logStreamRegistry'
import { createQuickPick, DataQuickPickItem } from '../../shared/ui/pickerPrompter'
import { Wizard } from '../../shared/wizards/wizard'
import { createInputBox } from '../../shared/ui/inputPrompter'
import { createURIFromArgs } from '../cloudWatchLogsUtils'
import { DefaultCloudWatchLogsClient } from '../../shared/clients/cloudWatchLogsClient'
import { CloudWatchLogs } from 'aws-sdk'
import { LogGroupNode } from '../explorer/logGroupNode'

export async function searchLogGroup(node: LogGroupNode, registry: LogStreamRegistry): Promise<void> {
    let result: telemetry.Result = 'Succeeded'
    let logGroupInfo: CloudWatchLogsGroupInfo
    let parameters: CloudWatchLogsParameters
    let response: SearchLogGroupWizardResponse | undefined

    const regionCode = 'us-west-2'

    if (node) {
        if (!node.logGroup.logGroupName) {
            throw new Error('CWL: Log Group node does not have name attached')
        }
        logGroupInfo = {
            groupName: node.logGroup.logGroupName,
            regionName: node.regionCode,
        }

        response = await new SearchLogGroupWizard([], logGroupInfo).run()
    } else {
        const regionCode = 'us-west-2'
        const client = new DefaultCloudWatchLogsClient(regionCode)
        const logGroups = await logGroupsToArray(client.describeLogGroups())
        response = await new SearchLogGroupWizard(logGroups).run()
    }

    if (response) {
        logGroupInfo = {
            groupName: response.logGroup,
            regionName: regionCode,
        }

        parameters = {
            limit: registry.configuration.get('limit', 10000),
            filterPattern: response.filterPattern,
        }
        const uri = createURIFromArgs(logGroupInfo, parameters)
        const initialStreamData: CloudWatchLogsData = {
            data: [],
            parameters: parameters,
            busy: false,
            logGroupInfo: logGroupInfo,
            retrieveLogsFunction: filterLogEventsFromUriComponents,
        }

        await registry.registerLog(uri, initialStreamData)
        const doc = await vscode.workspace.openTextDocument(uri) // calls back into the provider
        vscode.languages.setTextDocumentLanguage(doc, 'log')
        await vscode.window.showTextDocument(doc, { preview: false })
    } else {
        result = 'Cancelled'
    }
    telemetry.recordCloudwatchlogsOpenStream({ result })
}

async function logGroupsToArray(logGroups: AsyncIterableIterator<CloudWatchLogs.LogGroup>): Promise<string[]> {
    const logGroupsArray = []
    for await (const logGroupObject of logGroups) {
        logGroupObject.logGroupName && logGroupsArray.push(logGroupObject.logGroupName)
    }
    return logGroupsArray
}

export function createLogGroupPrompter(logGroups: string[]) {
    const options = logGroups.map<DataQuickPickItem<string>>(logGroupString => ({
        label: logGroupString,
        data: logGroupString,
    }))

    return createQuickPick(options, {
        title: 'Select Log Group',
        placeholder: 'Enter text here',
    })
}

export function createFilterpatternPrompter() {
    return createInputBox({
        title: 'Keyword Search',
        placeholder: 'Enter text here',
    })
}

export interface SearchLogGroupWizardResponse {
    logGroup: string
    filterPattern: string
}

export class SearchLogGroupWizard extends Wizard<SearchLogGroupWizardResponse> {
    public constructor(logGroups: string[], logGroupInfo?: CloudWatchLogsGroupInfo) {
        super()
        if (!logGroupInfo) {
            this.form.logGroup.bindPrompter(() => createLogGroupPrompter(logGroups))
        } else {
            this.form.logGroup.setDefault(logGroupInfo.groupName)
        }
        this.form.filterPattern.bindPrompter(createFilterpatternPrompter)
    }
}
