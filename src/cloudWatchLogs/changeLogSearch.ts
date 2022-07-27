/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as telemetry from '../shared/telemetry/telemetry'
import * as vscode from 'vscode'
import { showInputBox } from '../shared/ui/inputPrompter'
import { isLogStream } from './cloudWatchLogsUtils'
import { prepareDocument } from './commands/searchLogGroup'
import { getActiveUri } from './document/logStreamDocumentProvider'
import { CloudWatchLogsData, filterLogEventsFromUriComponents, LogStreamRegistry } from './registry/logStreamRegistry'
import { isViewAllEvents, TimeFilterResponse, TimeFilterSubmenu } from './timeFilterSubmenu'

type ChangeableParam = 'filterPattern' | 'timeFilter'

export async function getNewData(
    registry: LogStreamRegistry,
    param: ChangeableParam,
    oldUri: vscode.Uri
): Promise<CloudWatchLogsData | undefined> {
    const oldData = registry.getLogData(oldUri) as CloudWatchLogsData
    const newData: CloudWatchLogsData = {
        ...oldData,
        data: [],
        next: undefined,
        previous: undefined,
    }

    switch (param) {
        case 'filterPattern':
            const newPattern = await showInputBox({
                title: isLogStream(oldUri) ? 'Filter Log Stream Results' : 'Log Group Keyword Search',
                placeholder: oldData.parameters.filterPattern ?? 'Enter Text Here',
            })
            if (newPattern === undefined) {
                return
            }
            newData.parameters.filterPattern = newPattern

            break

        case 'timeFilter':
            const newTimeRange = (await new TimeFilterSubmenu().prompt()) as TimeFilterResponse
            if (newTimeRange === undefined) {
                return
            }
            newData.parameters.startTime = isViewAllEvents(newTimeRange) ? undefined : newTimeRange.start
            newData.parameters.endTime = isViewAllEvents(newTimeRange) ? undefined : newTimeRange.end

            break
    }
    if (newData.parameters.streamName) {
        newData.retrieveLogsFunction = filterLogEventsFromUriComponents
        newData.parameters.streamNameOptions = [newData.parameters.streamName]
        newData.parameters.streamName = undefined
    }

    return newData
}

export async function changeLogSearchParams(registry: LogStreamRegistry, param: ChangeableParam): Promise<void> {
    let result: telemetry.Result = 'Succeeded'

    const oldUri = getActiveUri(registry)
    const newData = await getNewData(registry, param, oldUri)

    if (!newData) {
        result = 'Cancelled'
        return
    }

    const newUri = await registry.registerLogWithNewUri(oldUri, newData)

    result = await prepareDocument(newUri, registry)

    console.log(result)
}
