/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as moment from 'moment'
import * as vscode from 'vscode'
import { CloudWatchLogs } from 'aws-sdk'
import { CloudWatchLogsSettings, parseCloudWatchLogsUri } from '../cloudWatchLogsUtils'
import { CloudWatchLogsClient } from '../../shared/clients/cloudWatchLogsClient'

import { getLogger } from '../../shared/logger'
import { INSIGHTS_TIMESTAMP_FORMAT } from '../../shared/constants'
import globals from '../../shared/extensionGlobals'

// TODO: Add debug logging statements

/**
 * Class which contains CRUD operations and persistence for CloudWatch Logs streams.
 */
export class LogStreamRegistry {
    private readonly _onDidChange: vscode.EventEmitter<vscode.Uri> = new vscode.EventEmitter<vscode.Uri>()

    public constructor(
        public readonly configuration: CloudWatchLogsSettings,
        private readonly activeStreams: Map<string, CloudWatchLogsData> = new Map<string, CloudWatchLogsData>()
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
            this.setLog(uri, initialStreamData)
            await this.updateLog(uri, 'tail')
        }
    }

    /**
     * Returns whether or not the log is registered.
     * @param uri Document URI
     */
    public hasLog(uri: vscode.Uri): boolean {
        return this.activeStreams.has(uri.path)
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

        const currData = this.getLog(uri)

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
        const stream = this.getLog(uri)
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

            this.setLog(uri, {
                ...stream,
                ...tokens,
                data: newData,
            })

            this._onDidChange.fire(uri)
        } catch (e) {
            const err = e as Error
            vscode.window.showErrorMessage(
                localize(
                    'AWS.cloudWatchLogs.viewLogStream.errorRetrievingLogs',
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
        this.activeStreams.delete(uri.path)
    }

    public setBusyStatus(uri: vscode.Uri, isBusy: boolean): void {
        const log = this.getLog(uri)
        if (log) {
            this.setLog(uri, {
                ...log,
                busy: isBusy,
            })
        }
    }

    public getBusyStatus(uri: vscode.Uri): boolean {
        const log = this.getLog(uri)

        return (log && log.busy) ?? false
    }

    private setLog(uri: vscode.Uri, stream: CloudWatchLogsData): void {
        this.activeStreams.set(uri.path, stream)
    }

    private getLog(uri: vscode.Uri): CloudWatchLogsData | undefined {
        return this.activeStreams.get(uri.path)
    }
}

export async function getLogEventsFromUriComponents(
    logGroupInfo: CloudWatchLogsGroupInfo,
    parameters: CloudWatchLogsParameters,
    nextToken?: string
): Promise<CloudWatchLogsResponse> {
    const client: CloudWatchLogsClient = globals.toolkitClientBuilder.createCloudWatchLogsClient(
        logGroupInfo.regionName
    )

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

export class CloudWatchLogsData {
    data: CloudWatchLogs.OutputLogEvents = []
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
