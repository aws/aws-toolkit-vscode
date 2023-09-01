/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { CloudWatchLogs } from 'aws-sdk'
import { CloudWatchLogsSettings, parseCloudWatchLogsUri, uriToKey, msgKey } from '../cloudWatchLogsUtils'
import { DefaultCloudWatchLogsClient } from '../../shared/clients/cloudWatchLogsClient'
import { CancellationError, waitTimeout } from '../../shared/utilities/timeoutUtils'
import { Messages } from '../../shared/utilities/messages'
import { isAwsError } from '../../shared/errors'
import { getLogger } from '../../shared/logger'
import { Settings } from '../../shared/settings'

/** Uri as a string */
export type UriString = string
/**
 * Operations and persistence for CloudWatch Log Data (events from a single logstream or events from log group search)
 */
export class LogDataRegistry {
    private readonly _onDidChange: vscode.EventEmitter<vscode.Uri> = new vscode.EventEmitter<vscode.Uri>()

    static #instance: LogDataRegistry

    public static get instance() {
        return (this.#instance ??= new this())
    }

    public constructor(
        public readonly configuration: CloudWatchLogsSettings = new CloudWatchLogsSettings(Settings.instance),
        private readonly registry: Map<UriString, CloudWatchLogsData> = new Map()
    ) {}

    /**
     * Event fired on log content change
     */
    public get onDidChange(): vscode.Event<vscode.Uri> {
        return this._onDidChange.event
    }

    /** Disposes registry structures associated with the given document. Does not dispose the document itself. */
    public disposeRegistryData(uri: vscode.Uri): void {
        this.registry.delete(uriToKey(uri))
    }

    /**
     * Returns whether or not the log is registered.
     * @param uri Document URI
     */
    public isRegistered(uri: vscode.Uri): boolean {
        return this.registry.has(uriToKey(uri))
    }

    public fetchCachedLogEvents(uri: vscode.Uri): CloudWatchLogsEvent[] {
        if (!this.isRegistered(uri)) {
            this.registerInitialLog(uri)
        }
        return this.getRegisteredLog(uri).events
    }

    /** Gets adjusted start/end times for extending existing search results. */
    private getStartEnd(logData: CloudWatchLogsData, direction: 'head' | 'tail', isSearch: boolean) {
        const r = {
            startTime: logData.parameters.startTime,
            endTime: logData.parameters.endTime,
        }
        const evStart = logData.events[0]?.timestamp
        const evEnd = logData.events[logData.events.length - 1]?.timestamp
        const startStr = evStart ? new Date(evStart).toUTCString() : 'none'
        const endStr = evEnd ? new Date(evEnd).toUTCString() : 'none'
        getLogger().debug('cloudwatch logs: eventsStart: "%s", eventsEnd: "%s"', startStr, endStr)
        if (isSearch) {
            // Update start/end parameters, choose intuitive range based on previously chosen range
            // (fall back: extend by 1 day).
            const oneDay = 1000 * 60 * 60 * 24
            const delta = r.endTime && r.startTime ? r.endTime - r.startTime : oneDay
            if (direction === 'head') {
                r.endTime = (r.startTime && (!evStart || r.startTime < evStart) ? r.startTime : evStart) ?? Date.now()
                r.startTime = r.endTime - delta
            } else {
                r.startTime = (r.endTime && (!evEnd || r.endTime > evEnd) ? r.endTime : evEnd) ?? Date.now()
                r.endTime = r.startTime + delta
            }
        }
        return r
    }

    /**
     * Fetches the next ("tail") or previous ("head") events batch for a log stream or log group
     * search, and adds them to the registry.
     *
     * Not "thread safe": multiple simultaneous requests to the same URI will have a data race.
     *
     * @param uri Document that presents the log stream or search results.
     * @param isNew If true, the existing document for `uri` will be cleared before loading results. If false, results are appended/prepended to the existing document.
     * @param direction `'head'` gets events before `logData.previous.token` (or before the oldest event, if extending existing _search_ results), `'tail'` gets events from `logData.next.token` (or after the newest event, if extending existing _search_ results).
     */
    public async fetchNextLogEvents(
        uri: vscode.Uri,
        isNew: boolean,
        direction: 'head' | 'tail' = 'tail'
    ): Promise<CloudWatchLogsEvent[]> {
        const isHead = direction === 'head'

        if (!this.isRegistered(uri)) {
            this.registerInitialLog(uri)
        }

        // Get existing data. It will be modified in various ways below (not "thread safe", thanks to the "registry").
        const logData = this.getRegisteredLog(uri)
        const request: CloudWatchLogsResponse = {
            events: [],
            nextForwardToken: logData.next?.token,
            nextBackwardToken: logData.previous?.token,
        }
        // Is this a filter request or a full (unfiltered) log stream?
        const isSearch = !logData.logGroupInfo.streamName

        if (!isSearch && isHead && logData.previous?.token === undefined) {
            // If we don't return now, redundant data will be retrieved.
            return []
        }

        // For search results ("Load newer/older..."): adjust the start/end "window".
        const oldRange = { startTime: logData.parameters.startTime, endTime: logData.parameters.endTime }
        const startEnd = isNew ? logData.parameters : this.getStartEnd(logData, direction, isSearch)
        logData.parameters.startTime = startEnd.startTime
        logData.parameters.endTime = startEnd.endTime

        const response = await logData.retrieveLogsFunction(
            logData.logGroupInfo,
            logData.parameters,
            isHead ? request.nextBackwardToken : request.nextForwardToken
        )

        // For search results: before storing (setLogData), expand the range to the maximum
        // start/end so that the "window" covers all results batches in the document.
        logData.parameters.startTime = logData.parameters.startTime
            ? Math.min(oldRange.startTime ?? Number.MAX_VALUE, logData.parameters.startTime)
            : undefined
        logData.parameters.endTime = logData.parameters.endTime
            ? Math.max(oldRange.endTime ?? 0, logData.parameters.endTime)
            : undefined

        // Replace (if "new") or extend existing results.
        logData.events = isNew
            ? response.events
            : isHead
            ? (response.events ?? []).concat(logData.events)
            : logData.events.concat(response.events ?? [])

        // Update tokens on the existing logData entry.
        if ((!logData.previous || isHead) && response.nextBackwardToken) {
            logData.previous = { token: response.nextBackwardToken }
        }
        if (!logData.next || !isHead) {
            const token = response.nextForwardToken ?? request.nextForwardToken
            if (token) {
                logData.next = { token: token }
            }
        }
        this.setLogData(uri, logData)

        this._onDidChange.fire(uri)
        return logData.events
    }

    public setBusyStatus(uri: vscode.Uri, isBusy: boolean): void {
        const log = this.getRegisteredLog(uri)
        if (log) {
            this.setLogData(uri, {
                ...log,
                busy: isBusy,
            })
        }
    }

    public getBusyStatus(uri: vscode.Uri): boolean {
        const log = this.getRegisteredLog(uri)
        return (log && log.busy) ?? false
    }

    protected setLogData(uri: vscode.Uri, newData: CloudWatchLogsData): void {
        this.registry.set(uriToKey(uri), newData)
    }

    protected getLogData(uri: vscode.Uri): CloudWatchLogsData | undefined {
        return this.registry.get(uriToKey(uri))
    }

    public registerInitialLog(
        uri: vscode.Uri,
        retrieveLogsFunction: typeof filterLogEventsFromUri = filterLogEventsFromUri
    ): void {
        if (this.isRegistered(uri)) {
            throw new Error(`Already registered: ${uri.toString()}`)
        }
        const data = parseCloudWatchLogsUri(uri)
        this.setLogData(uri, initLogData(data.logGroupInfo, data.parameters, retrieveLogsFunction))
    }

    public getRegisteredLog(uri: vscode.Uri): CloudWatchLogsData {
        const logData = this.getLogData(uri)
        if (!logData) {
            throw Error(`Cannot get data for unregistered uri: ${uri.toString()}`)
        }
        return logData
    }
}

/**
 * Fetches logs, optionally matching a log group and search pattern (`CloudWatchLogsParameters.filterPattern`).
 * Continues requesting pages (if any) until `CloudWatchLogsParameters.limit` is reached.
 *
 * @param completeTimeout Close the progress message before returning.
 */
export async function filterLogEventsFromUri(
    logGroupInfo: CloudWatchLogsGroupInfo,
    parameters: CloudWatchLogsParameters,
    initialNextToken?: string,
    completeTimeout = true
): Promise<CloudWatchLogsResponse> {
    const client = new DefaultCloudWatchLogsClient(logGroupInfo.regionName)
    // Is this a filter request or a full (unfiltered) log stream?
    const isSearch = !logGroupInfo.streamName

    const request: CloudWatchLogs.FilterLogEventsRequest = {
        logGroupName: logGroupInfo.groupName,
        filterPattern: parameters.filterPattern,
        nextToken: initialNextToken,
        limit: parameters.limit,
        startTime: parameters.startTime,
        endTime: parameters.endTime,
        logStreamNames: logGroupInfo.streamName ? [logGroupInfo.streamName] : [],
    }

    if (parameters.streamNameOptions) {
        request.logStreamNames?.concat(parameters.streamNameOptions)
    } else if (request.logStreamNames?.length === 0) {
        // API fails on empty array
        request.logStreamNames = undefined
    }

    let pages = 0
    let failed = 0
    const limit = request.limit ?? 10_000
    const result: CloudWatchLogsResponse = {
        events: [],
        nextBackwardToken: initialNextToken,
        nextForwardToken: undefined,
    }

    // Fetch pages (if any) until limit is reached.
    while ((pages === 0 && failed === 0) || (request.nextToken && limit > 1 && result.events.length < limit)) {
        const eventsMsg = `${result.events.length} events${
            pages > 0 && result.events.length === 0 ? ' (only empty pages so far)' : ''
        }`
        const progressMsg = logGroupInfo.streamName ?? (limit > 1 ? `${eventsMsg}, page ${pages + 1}` : eventsMsg)
        const msgTimeout = await Messages.putMessage(
            msgKey(logGroupInfo),
            `${isSearch ? 'Searching' : 'Loading from'}: ${logGroupInfo.groupName}`,
            { message: progressMsg },
            1000 * 60 * 60 * 24 // 24 hours, want "infinite"...
        )
        try {
            let response: Pick<CloudWatchLogs.FilterLogEventsResponse, 'events' | 'nextToken'> | undefined
            if (isSearch) {
                const requestPromise = client.filterLogEvents(request)
                response = await waitTimeout(requestPromise, msgTimeout, {
                    allowUndefined: false,
                    completeTimeout: false,
                })
            } else {
                const requestPromise = client.getLogEvents({
                    startFromHead: true, // Important! #3295
                    logStreamName: logGroupInfo.streamName ?? '?',
                    logGroupName: request.logGroupName,
                    logGroupIdentifier: request.logGroupIdentifier,
                    limit: request.limit,
                    nextToken: request.nextToken,
                })
                response = await waitTimeout(requestPromise, msgTimeout, {
                    allowUndefined: false,
                    completeTimeout: false,
                })
                if (response) {
                    // Hack around SDK inconsistency...
                    response.nextToken = (response as CloudWatchLogs.GetLogEventsResponse).nextForwardToken
                }
            }

            if (!response) {
                break // ??
            }

            // Accumulate data.
            result.events.push(...(response?.events ?? []))
            pages += 1

            // Return the last nextToken as the "forward token".
            result.nextForwardToken = response.nextToken ?? result.nextForwardToken

            // "If you have reached the end of the stream, it returns the same token you passed in."
            // https://docs.aws.amazon.com/AmazonCloudWatchLogs/latest/APIReference/API_GetLogEvents.html
            if (!response.nextToken || request.nextToken === response.nextToken) {
                break // End of pages.
            }

            // Prepare next request.
            request.nextToken = response.nextToken
        } catch (e) {
            if (CancellationError.isUserCancelled(e)) {
                msgTimeout.cancel()
                if (result.events.length > 0) {
                    break // Show results if there are any.
                }
                throw e // No results. Don't show empty document.
            }

            failed += 1

            if (isAwsError(e)) {
                // TODO: add getLogger().logAwsError() or something like that...
                getLogger().error(
                    'cloudwatch logs: fetch failed: %s (statuscode: %O request-id: %O): %s',
                    e.code,
                    e.statusCode,
                    e.requestId,
                    e.message
                )
                result.events.push({
                    message: `[request failed: ${e.message}]`,
                    // logStreamName: 'invalid',
                    // timestamp: 0,
                    // ingestionTime?: Timestamp;
                    // eventId?: EventId;
                })
            } else {
                getLogger().error('cloudwatch logs: fetch failed: %s', (e as Error).message)
            }

            if (failed > 3) {
                break
            }
        }
    }

    if (completeTimeout) {
        const msgTimeout = await Messages.putMessage(msgKey(logGroupInfo), '')
        msgTimeout.dispose()
    }

    if (limit > 1) {
        // Don't log the validation request (limit=1).
        getLogger().info(
            'cloudwatch logs: fetched %d events (%d pages, %d failed) from log group: %s',
            result.events.length,
            pages,
            failed,
            logGroupInfo.groupName
        )
    }

    return result
}

/** Creates a log data container including a log fetcher which will populate the data if called. */
export function initLogData(
    logGroupInfo: CloudWatchLogsGroupInfo,
    parameters: CloudWatchLogsParameters,
    retrieveLogsFunction: typeof filterLogEventsFromUri
): CloudWatchLogsData {
    return {
        events: [],
        parameters: parameters,
        logGroupInfo: logGroupInfo,
        retrieveLogsFunction: retrieveLogsFunction,
        busy: false,
    }
}

export type CloudWatchLogsGroupInfo = {
    groupName: string
    regionName: string
    streamName?: string
}

export type CloudWatchLogsParameters = {
    filterPattern?: string
    startTime?: number
    endTime?: number
    limit?: number
    streamNameOptions?: string[]
}

export type CloudWatchLogsResponse = {
    events: CloudWatchLogs.FilteredLogEvents
    nextForwardToken?: CloudWatchLogs.NextToken
    nextBackwardToken?: CloudWatchLogs.NextToken
}

export type CloudWatchLogsEvent = CloudWatchLogs.OutputLogEvent & {
    logStreamName?: string
    eventId?: string
}

export class CloudWatchLogsData {
    events: CloudWatchLogsEvent[] = []
    parameters: CloudWatchLogsParameters = {}
    logGroupInfo!: CloudWatchLogsGroupInfo
    retrieveLogsFunction!: typeof filterLogEventsFromUri
    next?: {
        token: CloudWatchLogs.NextToken
    }
    previous?: {
        token: CloudWatchLogs.NextToken
    }
    busy: boolean = false
}
