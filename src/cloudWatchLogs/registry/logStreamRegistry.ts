/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as moment from 'moment'
import * as vscode from 'vscode'
import { CloudWatchLogs } from 'aws-sdk'
import { CloudWatchLogsSettings, parseCloudWatchLogsUri, uriToKey } from '../cloudWatchLogsUtils'
import { getLogger } from '../../shared/logger'
import { INSIGHTS_TIMESTAMP_FORMAT } from '../../shared/constants'
import { DefaultCloudWatchLogsClient } from '../../shared/clients/cloudWatchLogsClient'

// TODO: Add debug logging statements

/**
 * Class which contains CRUD operations and persistence for CloudWatch Logs streams.
 */
export class LogStreamRegistry {
    private readonly _onDidChange: vscode.EventEmitter<vscode.Uri> = new vscode.EventEmitter<vscode.Uri>()

    public constructor(
        public readonly configuration: CloudWatchLogsSettings,
        private readonly activeLogs: Map<string, ActiveTab> = new Map<string, ActiveTab>()
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
     * @param getLogEventsFromUriComponentsFn Override for testing purposes.
     */
    public async registerLog(uri: vscode.Uri, initialStreamData: CloudWatchLogsData): Promise<void> {
        // ensure this is a CloudWatchLogs URI; don't need the return value, just need to make sure it doesn't throw.
        parseCloudWatchLogsUri(uri)
        if (!this.hasLog(uri)) {
            this.setLogData(uri, initialStreamData)
            await this.updateLog(uri, 'tail')
        }
    }

    /**
     * Returns whether or not the log is registered.
     * @param uri Document URI
     */
    public hasLog(uri: vscode.Uri): boolean {
        return this.activeLogs.has(uriToKey(uri))
    }

    /**
     * Returns the currently-held log content for a URI as a formatted string.
     * @param uri Document URI
     * @param formatting Optional params for outputting log messages.
     */
    public getLogContent(uri: vscode.Uri, formatting?: { timestamps?: boolean }): string | undefined {
        const inlineNewLineRegex = /((\r\n)|\n|\r)(?!$)/g

        // if no timestamp for some reason, entering a blank of equal length (29 characters long)
        const timestampSpaceEquivalent = '                             '

        const currData = this.getLogData(uri)

        if (!currData) {
            return undefined
        }

        let output: string = ''
        for (const datum of currData.data) {
            let line: string = datum.message ?? ''
            if (formatting?.timestamps) {
                // TODO: Handle different timezones and unix timestamps?
                const timestamp = datum.timestamp
                    ? moment(datum.timestamp).format(INSIGHTS_TIMESTAMP_FORMAT)
                    : timestampSpaceEquivalent
                line = timestamp.concat('\t', line)
                // log entries containing newlines are indented to the same length as the timestamp.
                line = line.replace(inlineNewLineRegex, `\n${timestampSpaceEquivalent}\t`)
            }
            if (datum.logStreamName) {
                const logStream = `[streamID: ${datum.logStreamName}]`
                line = logStream.concat('\t', line)
            }
            if (!line.endsWith('\n')) {
                line = line.concat('\n')
            }
            output = output.concat(line)
        }

        return output
    }
    /**
     * Retrieves the next set of data for a log and adds it to the registry. Data can either be added to the front of the log (`'head'`) or end (`'tail'`)
     * @param uri Document URI
     * @param headOrTail Determines update behavior: `'head'` retrieves the most recent previous token and appends data to the top of the log, `'tail'` does the opposite. Default: `'tail'`
     * @param getLogEventsFromUriComponentsFn Override for testing purposes.
     */
    public async updateLog(uri: vscode.Uri, headOrTail: 'head' | 'tail' = 'tail'): Promise<void> {
        const stream = this.getLogData(uri)
        if (!stream) {
            getLogger().debug(`No registry entry for ${uri.path}`)
            return
        }
        const nextToken = headOrTail === 'head' ? stream.previous?.token : stream.next?.token
        const uriResults = parseCloudWatchLogsUri(uri)

        const logGroupInfo = uriResults.logGroupInfo

        try {
            // TODO: Consider getPaginatedAwsCallIter? Would need a way to differentiate between head/tail...
            const logEvents = await stream.retrieveLogsFunction(stream.logGroupInfo, stream.parameters, nextToken)

            const newData =
                headOrTail === 'head'
                    ? (logEvents.events ?? []).concat(stream.data)
                    : stream.data.concat(logEvents.events ?? [])

            const tokens: Pick<CloudWatchLogsData, 'next' | 'previous'> = {}
            // update if no token exists or if the token is updated in the correct direction.
            if (!stream.previous || headOrTail === 'head') {
                tokens.previous = {
                    token: logEvents.nextBackwardToken ?? '',
                }
            }
            if (!stream.next || headOrTail === 'tail') {
                tokens.next = {
                    token: logEvents.nextForwardToken ?? '',
                }
            }

            this.setLogData(uri, {
                ...stream,
                ...tokens,
                data: newData,
            })

            this._onDidChange.fire(uri)
        } catch (e) {
            const err = e as Error
            vscode.window.showErrorMessage(
                localize(
                    'AWS.cwl.viewLogStream.errorRetrievingLogs',
                    'Error retrieving logs for Log Group {0} : {1}',
                    logGroupInfo.groupName,
                    err.message
                )
            )
        }
    }

    /**
     * Deletes a stream from the registry.
     * @param uri Document URI
     */
    public deregisterLog(uri: vscode.Uri): void {
        this.activeLogs.delete(uriToKey(uri))
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
        this.activeLogs.set(uriToKey(uri), { data: newData, editor: this.getTextEditor(uri) })
    }

    public getLogData(uri: vscode.Uri): CloudWatchLogsData | undefined {
        return this.activeLogs.get(uriToKey(uri))?.data
    }

    public setTextEditor(uri: vscode.Uri, textEditor: vscode.TextEditor): void {
        const oldData = this.getLogData(uri)
        if (!oldData) {
            throw new Error(`Unable to assign textEditor to activeLog entry ${uriToKey(uri)} with no log data.`)
        }
        this.activeLogs.set(uriToKey(uri), { data: oldData, editor: textEditor })
    }

    public getTextEditor(uri: vscode.Uri): vscode.TextEditor | undefined {
        return this.activeLogs.get(uriToKey(uri))?.editor
    }

    public hasTextEditor(uri: vscode.Uri): boolean {
        return this.hasLog(uri) && this.getTextEditor(uri) !== undefined
    }
}

export async function filterLogEventsFromUriComponents(
    logGroupInfo: CloudWatchLogsGroupInfo,
    parameters: CloudWatchLogsParameters,
    nextToken?: string
): Promise<CloudWatchLogsResponse> {
    const client = new DefaultCloudWatchLogsClient(logGroupInfo.regionName)

    const response = await client.filterLogEvents({
        logGroupName: logGroupInfo.groupName,
        filterPattern: parameters.filterPattern,
        nextToken,
        limit: parameters.limit,
    })

    // Use heuristic of last token as backward token and next token as forward to generalize token form.
    // Note that this may become inconsistent if the contents of the calls are changing as they are being made.
    // However, this fail wouldn't really impact customers.
    return {
        events: response.events ? response.events : [],
        nextForwardToken: response.nextToken,
        nextBackwardToken: nextToken,
    }
}

export async function getLogEventsFromUriComponents(
    logGroupInfo: CloudWatchLogsGroupInfo,
    parameters: CloudWatchLogsParameters,
    nextToken?: string
): Promise<CloudWatchLogsResponse> {
    const client = new DefaultCloudWatchLogsClient(logGroupInfo.regionName)

    if (!parameters.streamName) {
        throw new Error(
            `Log Stream name not specified for log group ${logGroupInfo.groupName} on region ${logGroupInfo.regionName}`
        )
    }
    const response = await client.getLogEvents({
        logGroupName: logGroupInfo.groupName,
        logStreamName: parameters.streamName,
        nextToken,
        limit: parameters.limit,
    })

    return {
        events: response.events ? response.events : [],
        nextForwardToken: response.nextForwardToken,
        nextBackwardToken: response.nextBackwardToken,
    }
}

export interface ActiveTab {
    data: CloudWatchLogsData
    editor: vscode.TextEditor | undefined
}

export type CloudWatchLogsGroupInfo = {
    groupName: string
    regionName: string
}

export type CloudWatchLogsParameters = {
    filterPattern?: string
    startTime?: number
    limit?: number
    streamName?: string
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
