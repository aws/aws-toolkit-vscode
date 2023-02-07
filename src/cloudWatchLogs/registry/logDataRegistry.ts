/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { CloudWatchLogs } from 'aws-sdk'
import { CloudWatchLogsSettings, parseCloudWatchLogsUri, uriToKey } from '../cloudWatchLogsUtils'
import { getLogger } from '../../shared/logger'
import { DefaultCloudWatchLogsClient } from '../../shared/clients/cloudWatchLogsClient'
import { Timeout, waitTimeout } from '../../shared/utilities/timeoutUtils'
import { showMessageWithCancel } from '../../shared/utilities/messages'
import { pageableToCollection } from '../../shared/utilities/collectionUtils'
// TODO: Add debug logging statements

/** Uri as a string */
type UriString = string
/**
 * Operations and persistence for CloudWatch Log Data (events from a single logstream or events from log group search)
 */
export class LogDataRegistry {
    private readonly _onDidChange: vscode.EventEmitter<vscode.Uri> = new vscode.EventEmitter<vscode.Uri>()

    public constructor(
        public readonly configuration: CloudWatchLogsSettings,
        private readonly registry: Map<UriString, CloudWatchLogsData> = new Map()
    ) {}

    /**
     * Event fired on log content change
     */
    public get onDidChange(): vscode.Event<vscode.Uri> {
        return this._onDidChange.event
    }

    /**
     * Adds an entry to the registry for the given URI.
     * @param uri Document URI
     * @param initialLogData Initial Data to populate the registry ActiveTab Data.
     */
    public async registerLog(uri: vscode.Uri, initialLogData: CloudWatchLogsData): Promise<void> {
        // ensure this is a CloudWatchLogs URI; don't need the return value, just need to make sure it doesn't throw.
        parseCloudWatchLogsUri(uri)
        if (!this.hasLog(uri)) {
            this.setLogData(uri, initialLogData)
            await this.updateLog(uri, 'tail')
        }
    }

    /** Disposes registry structures associated with the given document. Does not dispose the document itself. */
    public disposeRegistryData(uri: vscode.Uri): void {
        this.registry.delete(uriToKey(uri))
    }

    /**
     * Returns whether or not the log is registered.
     * @param uri Document URI
     */
    public hasLog(uri: vscode.Uri): boolean {
        return this.registry.has(uriToKey(uri))
    }

    /**
     * Retrieves the next set of data for a log and adds it to the registry. Data can either be added to the front of the log (`'head'`) or end (`'tail'`)
     * @param uri Document URI
     * @param headOrTail Determines update behavior: `'head'` retrieves the most recent previous token and appends data to the top of the log, `'tail'` does the opposite. Default: `'tail'`
     * @param getLogEventsFromUriComponentsFn Override for testing purposes.
     */
    public async updateLog(uri: vscode.Uri, headOrTail: 'head' | 'tail' = 'tail'): Promise<void> {
        const logData = this.getLogData(uri)
        if (!logData) {
            getLogger().debug(`No registry entry for ${uri.path}`)
            return
        }
        const request: CloudWatchLogsResponse = {
            events: [],
            nextForwardToken: logData.next?.token,
            nextBackwardToken: logData.previous?.token,
        }

        const isHead = headOrTail === 'head'
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

        const responseData = await firstOrLast(stream, resp => resp.events.length > 0)

        if (!responseData) {
            return
        }

        const newData =
            headOrTail === 'head'
                ? (responseData.events ?? []).concat(logData.data)
                : logData.data.concat(responseData.events ?? [])

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
            data: newData,
        })

        this._onDidChange.fire(uri)
    }

    public setBusyStatus(uri: vscode.Uri, isBusy: boolean): void {
        const log = this.getLogData(uri)
        if (log) {
            this.setLogData(uri, {
                ...log,
                busy: isBusy,
            })
        }
    }

    public getBusyStatus(uri: vscode.Uri): boolean {
        const log = this.getLogData(uri)

        return (log && log.busy) ?? false
    }

    public setLogData(uri: vscode.Uri, newData: CloudWatchLogsData): void {
        this.registry.set(uriToKey(uri), newData)
    }

    public getLogData(uri: vscode.Uri): CloudWatchLogsData | undefined {
        return this.registry.get(uriToKey(uri))
    }
}

export async function filterLogEventsFromUriComponents(
    logGroupInfo: CloudWatchLogsGroupInfo,
    parameters: CloudWatchLogsParameters,
    nextToken?: string
): Promise<CloudWatchLogsResponse> {
    const client = new DefaultCloudWatchLogsClient(logGroupInfo.regionName)

    const cwlParameters: CloudWatchLogs.FilterLogEventsRequest = {
        logGroupName: logGroupInfo.groupName,
        filterPattern: parameters.filterPattern,
        nextToken,
        limit: parameters.limit,
    }

    if (parameters.startTime && parameters.endTime) {
        cwlParameters.startTime = parameters.startTime
        cwlParameters.endTime = parameters.endTime
    }

    if (parameters.streamNameOptions) {
        cwlParameters.logStreamNames = parameters.streamNameOptions
    }

    const timeout = new Timeout(300000)
    showMessageWithCancel(`Loading data from log group ${logGroupInfo.groupName}`, timeout)
    const responsePromise = client.filterLogEvents(cwlParameters)
    const response = await waitTimeout(responsePromise, timeout, { allowUndefined: false })

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
        throw new Error('cwl:`filterLogEvents` did not return anything.')
    }
}

export async function getLogEventsFromUriComponents(
    logGroupInfo: CloudWatchLogsGroupInfo,
    parameters: CloudWatchLogsParameters,
    nextToken?: string
): Promise<CloudWatchLogsResponse> {
    const client = new DefaultCloudWatchLogsClient(logGroupInfo.regionName)

    if (!logGroupInfo.streamName) {
        throw new Error(
            `Log Stream name not specified for log group ${logGroupInfo.groupName} on region ${logGroupInfo.regionName}`
        )
    }
    const cwlParameters = {
        logGroupName: logGroupInfo.groupName,
        logStreamName: logGroupInfo.streamName,
        nextToken,
        limit: parameters.limit,
    }

    const timeout = new Timeout(300000)
    showMessageWithCancel(`Loading data from log stream ${logGroupInfo.streamName}`, timeout)
    const responsePromise = client.getLogEvents(cwlParameters)
    const response = await waitTimeout(responsePromise, timeout, { allowUndefined: false })

    if (!response) {
        throw new Error('cwl:`getLogEvents` did not return anything.')
    }

    return {
        events: response.events ? response.events : [],
        nextForwardToken: response.nextForwardToken,
        nextBackwardToken: response.nextBackwardToken,
    }
}

export function getInitialLogData(
    logGroupInfo: CloudWatchLogsGroupInfo,
    parameters: CloudWatchLogsParameters,
    retrieveLogsFunction: CloudWatchLogsAction
): CloudWatchLogsData {
    return {
        data: [],
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
    data: CloudWatchLogsEvent[] = []
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
