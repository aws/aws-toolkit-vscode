/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { CloudWatchLogs } from 'aws-sdk'
import { CloudWatchLogsSettings, parseCloudWatchLogsUri, uriToKey, msgKey } from '../cloudWatchLogsUtils'
import { DefaultCloudWatchLogsClient } from '../../shared/clients/cloudWatchLogsClient'
import { waitTimeout } from '../../shared/utilities/timeoutUtils'
import { Messages } from '../../shared/utilities/messages'
import { pageableToCollection } from '../../shared/utilities/collectionUtils'
import { Settings } from '../../shared/settings'
// TODO: Add debug logging statements

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

    /**
     * Retrieves the next set of data for a log and adds it to the registry. Data can either be added to the front of the log (`'head'`) or end (`'tail'`)
     * @param uri Document URI
     * @param headOrTail Determines update behavior: `'head'` retrieves the most recent previous token and appends data to the top of the log, `'tail'` does the opposite. Default: `'tail'`
     * @param getLogEventsFromUriComponentsFn Override for testing purposes.
     */
    public async fetchNextLogEvents(
        uri: vscode.Uri,
        headOrTail: 'head' | 'tail' = 'tail'
    ): Promise<CloudWatchLogsEvent[]> {
        if (!this.isRegistered(uri)) {
            this.registerInitialLog(uri)
        }

        const logData = this.getRegisteredLog(uri)
        const request: CloudWatchLogsResponse = {
            events: [],
            nextForwardToken: logData.next?.token,
            nextBackwardToken: logData.previous?.token,
        }

        const isHead = headOrTail === 'head'

        // We are at the earliest data and trying to go back in time, there is nothing to see.
        // If we don't return now, redundant data will be retrieved.
        if (isHead && logData.previous?.token === undefined) {
            // show something so the user doesn't think nothing happened.
            await Messages.putMessage(
                msgKey(logData.logGroupInfo),
                `Loading from: '${logData.logGroupInfo.groupName}'`,
                undefined,
                500
            )
            return []
        }

        const stream = pageableToCollection(
            (r: typeof request) =>
                logData.retrieveLogsFunction(
                    logData.logGroupInfo,
                    logData.parameters,
                    isHead ? r.nextBackwardToken : r.nextForwardToken
                ),
            request,
            isHead ? 'nextBackwardToken' : 'nextForwardToken'
        )

        async function firstOrLast<T>(
            iterable: AsyncIterable<T>,
            predicate: (item: T) => boolean
        ): Promise<T | undefined> {
            let last: T | undefined
            for await (const item of iterable) {
                if (predicate((last = item))) {
                    return item
                }
            }
            return last
        }

        const msgTimeout = await Messages.putMessage(
            msgKey(logData.logGroupInfo),
            `Loading from: '${logData.logGroupInfo.groupName}'`
        )
        const responseData = await firstOrLast(stream, resp => resp.events.length > 0).finally(() => {
            msgTimeout.dispose()
        })

        if (!responseData) {
            return []
        }

        const newData =
            headOrTail === 'head'
                ? (responseData.events ?? []).concat(logData.events)
                : logData.events.concat(responseData.events ?? [])

        const tokens: Pick<CloudWatchLogsData, 'next' | 'previous'> = {}
        // update if no token exists or if the token is updated in the correct direction.
        if (!logData.previous || headOrTail === 'head') {
            const token = responseData.nextBackwardToken
            if (token) {
                tokens.previous = { token }
            }
        }
        if (!logData.next || headOrTail === 'tail') {
            const token = responseData.nextForwardToken ?? request.nextForwardToken
            if (token) {
                tokens.next = { token }
            }
        }
        this.setLogData(uri, {
            ...logData,
            ...tokens,
            events: newData,
        })

        this._onDidChange.fire(uri)
        return newData
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
        retrieveLogsFunction: CloudWatchLogsAction = filterLogEventsFromUri
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
 * @param completeTimeout True to close the vscode cancel window when request is completed.
 */
export async function filterLogEventsFromUri(
    logGroupInfo: CloudWatchLogsGroupInfo,
    parameters: CloudWatchLogsParameters,
    nextToken?: string,
    completeTimeout = false
): Promise<CloudWatchLogsResponse> {
    const client = new DefaultCloudWatchLogsClient(logGroupInfo.regionName)

    const cwlParameters: CloudWatchLogs.FilterLogEventsRequest = {
        logGroupName: logGroupInfo.groupName,
        filterPattern: parameters.filterPattern,
        nextToken,
        limit: parameters.limit,
    }

    if (logGroupInfo.streamName !== undefined) {
        cwlParameters.logStreamNames = [logGroupInfo.streamName]
    }

    if (parameters.startTime && parameters.endTime) {
        cwlParameters.startTime = parameters.startTime
        cwlParameters.endTime = parameters.endTime
    }

    cwlParameters.logStreamNames = []

    if (parameters.streamNameOptions) {
        cwlParameters.logStreamNames.concat(parameters.streamNameOptions)
    }

    if (logGroupInfo.streamName) {
        cwlParameters.logStreamNames.push(logGroupInfo.streamName)
    }

    if (cwlParameters.logStreamNames.length === 0) {
        // API fails on empty array
        delete cwlParameters.logStreamNames
    }

    const msgTimeout = await Messages.putMessage(msgKey(logGroupInfo), `Loading from: '${logGroupInfo.groupName}'`, {
        message: logGroupInfo.streamName ?? '',
    })

    const responsePromise = client.filterLogEvents(cwlParameters)
    const response = await waitTimeout(responsePromise, msgTimeout, { allowUndefined: false, completeTimeout })

    // Use heuristic of last token as backward token and next token as forward to generalize token form.
    // Note that this may become inconsistent if the contents of the calls are changing as they are being made.
    // However, this fail wouldn't really impact customers.
    if (response) {
        return {
            events: response.events ? response.events : [],
            nextForwardToken: response.nextToken,
            nextBackwardToken: nextToken,
        }
    } else {
        throw new Error('cwl: filterLogEvents returned null')
    }
}

/** Creates a log data container including a log fetcher which will populate the data if called. */
export function initLogData(
    logGroupInfo: CloudWatchLogsGroupInfo,
    parameters: CloudWatchLogsParameters,
    retrieveLogsFunction: CloudWatchLogsAction
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

export type CloudWatchLogsAction = (
    logGroupInfo: CloudWatchLogsGroupInfo,
    apiParameters: CloudWatchLogsParameters,
    nextToken?: string
) => Promise<CloudWatchLogsResponse>

export type CloudWatchLogsEvent = CloudWatchLogs.OutputLogEvent & {
    logStreamName?: string
    eventId?: string
}

export class CloudWatchLogsData {
    events: CloudWatchLogsEvent[] = []
    parameters: CloudWatchLogsParameters = {}
    logGroupInfo!: CloudWatchLogsGroupInfo
    retrieveLogsFunction!: CloudWatchLogsAction
    next?: {
        token: CloudWatchLogs.NextToken
    }
    previous?: {
        token: CloudWatchLogs.NextToken
    }
    busy: boolean = false
}
