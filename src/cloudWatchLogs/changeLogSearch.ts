/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { CancellationError } from '../shared/utilities/timeoutUtils'
import { telemetry } from '../shared/telemetry/telemetry'
import { showInputBox } from '../shared/ui/inputPrompter'
import { createURIFromArgs, isLogStreamUri, recordTelemetryFilter } from './cloudWatchLogsUtils'
import { prepareDocument } from './commands/searchLogGroup'
import { getActiveDocumentUri } from './document/logDataDocumentProvider'
import { CloudWatchLogsData, filterLogEventsFromUri, LogDataRegistry } from './registry/logDataRegistry'
import { TimeFilterResponse, TimeFilterSubmenu } from './timeFilterSubmenu'

/**
 * Prompts the user for new value for param in logSearch.
 * @param registry
 * @param param
 * @param oldUri
 * @returns Undefined if cancelled and the newData otherwise.
 */

export async function promptForSearchParam(
    param: 'filterPattern' | 'timeFilter',
    oldData: CloudWatchLogsData
): Promise<CloudWatchLogsData | undefined> {
    // We must deepcopy the parameters so that we don't change their original value in oldData
    const newData: CloudWatchLogsData = {
        ...oldData,
        parameters: { ...oldData.parameters },
        events: [],
        next: undefined,
        previous: undefined,
    }

    let newPattern: string | undefined
    let newTimeRange: TimeFilterResponse | undefined

    switch (param) {
        case 'filterPattern':
            newPattern = await showInputBox({
                title: oldData.logGroupInfo.streamName ? 'Filter Log Stream' : 'Search Log Group',
                placeholder: 'Enter Text Here',
                value: oldData.parameters.filterPattern ?? undefined,
            })
            if (newPattern === undefined) {
                return
            }
            newData.parameters.filterPattern = newPattern
            break

        case 'timeFilter':
            newTimeRange = (await new TimeFilterSubmenu(oldData.parameters).prompt()) as TimeFilterResponse
            if (newTimeRange === undefined) {
                return
            }
            newData.parameters.startTime = newTimeRange.start
            newData.parameters.endTime = newTimeRange.end
            break
    }

    if (newData.logGroupInfo.streamName) {
        newData.retrieveLogsFunction = filterLogEventsFromUri
        newData.parameters.streamNameOptions = [newData.logGroupInfo.streamName]
        newData.logGroupInfo.streamName = undefined
    }

    recordTelemetryFilter(newData)

    return newData
}

/**
 * Shows a wizard where the user can revise the time or pattern of an existing
 * log group search and update the search results.
 */
export async function updateLogSearch(registry: LogDataRegistry, param: 'filterPattern' | 'timeFilter'): Promise<void> {
    await telemetry.cloudwatchlogs_open.run(async span => {
        const oldUri = getActiveDocumentUri(registry)
        span.record({
            source: 'Editor',
            cloudWatchResourceType: isLogStreamUri(oldUri) ? 'logStream' : 'logGroup',
            hasTimeFilter: param === 'timeFilter',
            hasTextFilter: param === 'filterPattern',
        })

        if (!registry.isRegistered(oldUri)) {
            throw new Error(`cwl: Failed to get data for URI: ${oldUri}`)
        }

        const oldData = registry.getRegisteredLog(oldUri)
        const newData = await promptForSearchParam(param, oldData)
        span.record({
            cloudWatchResourceType: isLogStreamUri(oldUri) ? 'logStream' : 'logGroup',
            hasTimeFilter: !!oldData.parameters.startTime || param === 'timeFilter',
            hasTextFilter: !!oldData.parameters.filterPattern || param === 'filterPattern',
        })

        if (!newData) {
            throw new CancellationError('user')
        }

        const newUri = createURIFromArgs(newData.logGroupInfo, newData.parameters)
        await prepareDocument(newUri, registry, false)
    })
}
