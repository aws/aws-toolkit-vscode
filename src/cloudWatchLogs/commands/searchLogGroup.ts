/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as telemetry from '../../shared/telemetry/telemetry'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import {
    CloudWatchLogsData,
    CloudWatchLogsGroupInfo,
    CloudWatchLogsParameters,
    LogStreamRegistry,
    filterLogEventsFromUriComponents,
} from '../registry/logStreamRegistry'
import { CloudWatchLogsNode } from '../../../src/cloudWatchLogs/explorer/cloudWatchLogsNode'
import { createQuickPick, DataQuickPickItem } from '../../shared/ui/pickerPrompter'

import { Wizard } from '../../shared/wizards/wizard'
import { createInputBox } from '../../shared/ui/inputPrompter'
import { createURIFromArgs } from '../cloudWatchLogsUtils'

export async function searchLogGroup(registry: LogStreamRegistry): Promise<void> {
    let result: telemetry.Result = 'Succeeded'
    const regionCode = 'us-west-2'
    const logGroupNodes = await getLogGroupNodes(regionCode)
    const response = await new SearchLogGroupWizard(logGroupNodes).run()
    if (!response) {
        // What should I do if the Wizard does not get a response? Nothing seems like best option?
        return
    }

    const logGroupInfo: CloudWatchLogsGroupInfo = {
        groupName: response.logGroup,
        regionName: regionCode,
    }

    const parameters: CloudWatchLogsParameters = {
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

    telemetry.recordCloudwatchlogsOpenStream({ result })
}

function loadLogGroups(logGroups: AWSTreeNodeBase[]): DataQuickPickItem<string>[] {
    let options: DataQuickPickItem<string>[] = []
    let groupNode: AWSTreeNodeBase
    for (groupNode of logGroups) {
        if (groupNode.label) {
            options.push({
                label: groupNode.label,
                data: groupNode.label,
            })
        } else {
            // Not sure if this can/should ever happen, but put error message in case.
            throw new Error('Recieved Log Group in searchLogGroup Wizard without a label.')
        }
    }

    return options
}

async function getLogGroupNodes(regionCode: string) {
    const artificialNode = new CloudWatchLogsNode(regionCode)
    const logGroupNodes: AWSTreeNodeBase[] = await artificialNode.getChildren()
    return logGroupNodes
}

export function createLogGroupPrompter(logGroupNodes: AWSTreeNodeBase[]) {
    const logGroups = loadLogGroups(logGroupNodes)
    return createQuickPick(logGroups, {
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
    public constructor(logGroupNodes: AWSTreeNodeBase[]) {
        super()
        // TODO: I want the filterPattern to only prompt if the logGroup is given and properly recieved.
        this.form.logGroup.bindPrompter(() => createLogGroupPrompter(logGroupNodes))
        this.form.filterPattern.bindPrompter(createFilterpatternPrompter)
    }
}
