/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { showInputBox } from '../shared/ui/inputPrompter'
import { createURIFromArgs } from './cloudWatchLogsUtils'
import { prepareDocument } from './commands/searchLogGroup'
import { getActiveDocumentUri } from './document/logStreamDocumentProvider'
import { CloudWatchLogsData, filterLogEventsFromUriComponents, LogStreamRegistry } from './registry/logStreamRegistry'
import { isViewAllEvents, TimeFilterResponse, TimeFilterSubmenu } from './timeFilterSubmenu'

/**
 * Prompts the user for new value for param in logSearch.
 * @param registry
 * @param param
 * @param oldUri
 * @returns Undefined if cancelled and the newData otherwise.
 */

export async function getNewData(
    param: 'filterPattern' | 'timeFilter',
    oldData: CloudWatchLogsData
): Promise<CloudWatchLogsData | undefined> {
    // We must deepcopy the parameters so that we don't change their original value in oldData
    const newData: CloudWatchLogsData = {
        ...oldData,
        parameters: { ...oldData.parameters },
        data: [],
        next: undefined,
        previous: undefined,
    }

    let newPattern: string | undefined
    let newTimeRange: TimeFilterResponse | undefined

    switch (param) {
        case 'filterPattern':
            newPattern = await showInputBox({
                title: oldData.logGroupInfo.streamName ? 'Filter Log Stream' : 'Search Log Group',
                placeholder: oldData.parameters.filterPattern ?? 'Enter Text Here',
            })
            if (newPattern === undefined) {
                return
            }
            newData.parameters.filterPattern = newPattern

            break

        case 'timeFilter':
            newTimeRange = (await new TimeFilterSubmenu().prompt()) as TimeFilterResponse
            if (newTimeRange === undefined) {
                return
            }
            newData.parameters.startTime = isViewAllEvents(newTimeRange) ? undefined : newTimeRange.start
            newData.parameters.endTime = isViewAllEvents(newTimeRange) ? undefined : newTimeRange.end

            break
    }
    if (newData.logGroupInfo.streamName) {
        newData.retrieveLogsFunction = filterLogEventsFromUriComponents
        newData.parameters.streamNameOptions = [newData.logGroupInfo.streamName]
        newData.logGroupInfo.streamName = undefined
    }

    return newData
}

export async function changeLogSearchParams(
    registry: LogStreamRegistry,
    param: 'filterPattern' | 'timeFilter'
): Promise<void> {
    //let result: telemetry.Result = 'Succeeded'
    const oldUri = getActiveDocumentUri(registry)

    const oldData = registry.getLogData(oldUri)
    if (!oldData) {
        throw new Error(`cwl: Unable to find data for active URI ${oldUri}`)
    }
    const newData = await getNewData(param, oldData)

    if (!newData) {
        //result = 'Cancelled'
        return
    }

    const newUri = createURIFromArgs(newData.logGroupInfo, newData.parameters)

    //result = await prepareDocument(newUri, newData, registry)
    await prepareDocument(newUri, newData, registry)
    // TODO: add telemetry
}
