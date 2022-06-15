/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { LogGroupNode } from '../explorer/logGroupNode'
import * as telemetry from '../../shared/telemetry/telemetry'
import { CloudWatchAPIParameters, LogStreamRegistry } from '../registry/logStreamRegistry'
import { convertLogGroupInfoToUri } from '../cloudWatchLogsUtils'
import { createQuickPick, DataQuickPickItem } from '../../shared/ui/pickerPrompter'
import { Wizard } from '../../shared/wizards/wizard'
import { createInputBox } from '../../shared/ui/inputPrompter'
import { integer } from 'vscode-languageserver-types'
import { CloudWatchLogsNode } from '../explorer/cloudWatchLogsNode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { AwsContext } from '../../shared/awsContext'

export interface SearchLogGroup {
    region: string
    logGroupName: string
}

export async function searchLogGroup(
    AWSContext: AwsContext,
    registry: LogStreamRegistry,
    node?: LogGroupNode
): Promise<void> {
    let result: telemetry.Result = 'Succeeded'
    const regionOptions = await AWSContext.getExplorerRegions()
    const defaultRegion = await AWSContext.getCredentialDefaultRegion()
    const filterParameters = await new SearchLogGroupWizard(node, regionOptions, defaultRegion).run()

    // If no input is given, skip over?
    // TODO: Most likely better option here.
    if (!filterParameters) {
        return
    }
    const logGroupName = node ? node.name : filterParameters.logGroup
    // const regionCode = node ? node.regionCode : filterParameters.regionCode

    if (filterParameters.startTime !== 0) {
        filterParameters.startTime = makeTimeAbsolute(filterParameters)
    }

    const logGroupInfo = {
        groupName: logGroupName,
        regionName: filterParameters.regionCode,
    }

    const uri = convertLogGroupInfoToUri('filterLogEvents', logGroupInfo.groupName, logGroupInfo.regionName, {
        filterParameters: filterParameters,
    })
    console.log(logGroupInfo)
    await registry.registerLog(uri, logGroupInfo, filterParameters)
    //await registry.registerLogFilter(uri, filterParameters, logGroupInfo)
    const doc = await vscode.workspace.openTextDocument(uri) // calls back into the provider
    vscode.languages.setTextDocumentLanguage(doc, 'log')
    await vscode.window.showTextDocument(doc, { preview: false })
    telemetry.recordCloudwatchlogsOpenStream({ result })
}

function makeTimeAbsolute(filterParameters: CloudWatchAPIParameters) {
    const curTime = new Date().getTime()
    const timeToSubtract = Number(filterParameters.startTime) * 10 ** 6 * 3.6
    return curTime - timeToSubtract
}

function createKeywordPrompter() {
    return createInputBox({
        title: 'keyword search',
        placeholder: 'Enter keyword search here',
    })
}

function createDatetimePrompter() {
    // TODO: Make it so this doesn't have to be run everytime a user wants to search something.
    const strTimeOptions: integer[] = [1, 3, 6, 12, 24]
    const timeOptions: DataQuickPickItem<integer>[] = []

    for (var timeOption of strTimeOptions) {
        timeOptions.push({
            label: timeOption + ' hour',
            data: timeOption,
            description: 'Search all logs within the past ' + timeOption + ' hour',
        })
    }

    timeOptions.push({
        label: 'All time',
        data: 0,
        description: 'Search all log events.',
    })

    return createQuickPick(timeOptions)
}

function createLogGroupPrompter(regionCode: string) {
    const logGroups = getLogGroupsFromRegion(regionCode)

    const options: Promise<DataQuickPickItem<string>[]> = loadLogGroups([], logGroups)
    return createQuickPick(options)
}

function createRegionPrompter(regionOptions: Array<string>) {
    let quickPickOptions: DataQuickPickItem<string>[] = []
    for (var option of regionOptions) {
        quickPickOptions.push({
            label: option,
            data: option,
        })
    }

    return createQuickPick(quickPickOptions)
}

export interface SearchLogGroupWizardResponse {
    filterPattern: string
    startTime: number
    logGroup: string
    regionCode: string
}

async function loadLogGroups(options: DataQuickPickItem<string>[], logGroups: Promise<AWSTreeNodeBase[]>) {
    const logGroupsResult = await logGroups
    let logGroup
    for (logGroup of logGroupsResult) {
        if (logGroup.label) {
            options.push({
                label: logGroup.label,
                data: logGroup.label,
            })
        }
    }
    return options
}

async function getLogGroupsFromRegion(region: string) {
    const node = new CloudWatchLogsNode(region)
    const logGroups: AWSTreeNodeBase[] = await node.getChildren()
    return logGroups
}

export class SearchLogGroupWizard extends Wizard<SearchLogGroupWizardResponse> {
    public constructor(node: LogGroupNode | undefined, regionOptions: Array<string>, defaultRegion: string) {
        super()
        // If we don't get a node, we aren't working in the explorer => We must select region + log group by hand.
        if (!node) {
            // If they only have a single region on their explorer, default to that one.
            // Otherwise default to the one that is linked with their account.

            this.form.regionCode.setDefault(regionOptions.length === 1 ? regionOptions[0] : defaultRegion)
            this.form.regionCode.bindPrompter(() => createRegionPrompter(regionOptions), {
                showWhen: () => regionOptions.length !== 1,
            })
            this.form.logGroup.bindPrompter(({ regionCode }) => createLogGroupPrompter(regionCode!))
        } else {
            this.form.logGroup.setDefault(node.name)
            this.form.regionCode.setDefault(node.regionCode)
        }
        this.form.filterPattern.bindPrompter(createKeywordPrompter)
        this.form.startTime.bindPrompter(createDatetimePrompter)
    }
}
