/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as moment from 'moment'
import * as vscode from 'vscode'
import { CloudWatch, CloudWatchLogs } from 'aws-sdk'
import { CloudWatchLogsSettings, parseCloudWatchLogsUri } from '../cloudWatchLogsUtils'
import { CloudWatchLogsClient } from '../../shared/clients/cloudWatchLogsClient'

import { getLogger } from '../../shared/logger'
import { INSIGHTS_TIMESTAMP_FORMAT } from '../../shared/constants'
import globals from '../../shared/extensionGlobals'
import { CloudWatchLogsLogStreams } from 'aws-sdk/clients/opsworks'
import { integer } from 'aws-sdk/clients/backup'

// TODO: Add debug logging statements

/**
 * Class which contains CRUD operations and persistence for CloudWatch Logs streams.
 */
export class LogStreamRegistry {
    private readonly _onDidChange: vscode.EventEmitter<vscode.Uri> = new vscode.EventEmitter<vscode.Uri>()
    public constructor(
        private readonly configuration: CloudWatchLogsSettings,
        private readonly activeStreams: Map<string, CloudWatchLogData> = new Map<string, CloudWatchLogData>()
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
    public async registerLog(
        uri: vscode.Uri,
        logGroupInfo: CloudWatchLogsLogGroupInfo,
        filterParameters?: {
            filterPattern: string
            startTime: integer
        }
    ): Promise<void> {
        // ensure this is a CloudWatchLogs URI; don't need the return value, just need to make sure it doesn't throw.
        // parseCloudWatchLogsUri(uri)
        if (!this.hasLog(uri)) {
            if (filterParameters) {
                this.setLog(uri, {
                    data: [],
                    logGroupInfo: logGroupInfo,
                    busy: false,
                    filterParameters: filterParameters,
                })
            } else {
                this.setLog(uri, {
                    data: [],
                    logGroupInfo: logGroupInfo,
                    busy: false,
                })
            }

            await this.updateLog(uri, 'tail')
        }
    }

    // public async registerLogFilter(
    //     uri: vscode.Uri,
    //     filterParameters: {
    //         filterPattern: string,
    //         startTime: integer
    //     },
    //     logGroupInfo: {
    //         groupName: string
    //         regionName: string
    //     },
    //     filterLogEventsFromUriComponentsFn?: (
    //         logGroupInfo: {
    //             groupName: string,
    //             regionName: string,
    //         },
    //         filterParameters: {
    //             filterPattern: string,
    //             startTime: integer
    //         },
    //         nextToken?: string,
    //     ) => Promise<CloudWatchLogs.FilterLogEventsResponse>):Promise<void> {
    //         parseCloudWatchLogsUri(uri)
    //         if(!this.hasLog(uri)) {
    //             this.setLog(uri, new CloudWatchLogStreamData())
    //             await this.updateLogFilter(uri, 'tail', filterParameters, logGroupInfo, filterLogEventsFromUriComponentsFn
    //             )
    //         }
    //     }

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

    // public async updateLogFilter(
    //     uri: vscode.Uri,
    //     headOrTail: 'head' | 'tail' = 'tail',
    //     filterParameters: {
    //         filterPattern: string,
    //         startTime: integer
    //     },
    //     logGroupInfo: {
    //         groupName: string
    //         regionName: string
    //     },
    //     filterLogEventsFromUriComponentsFn?: (
    //         logGroupInfo: {
    //             groupName: string
    //             regionName: string
    //         },
    //         filterParameters: {
    //             filterPattern: string,
    //             startTime: integer
    //         },
    //         nextToken?: string)
    //         => Promise<CloudWatchLogs.FilterLogEventsResponse>
    // ): Promise<void> {
    //     const stream = this.getLog(uri)
    //     if (!stream) {
    //         getLogger().debug('No registry entry for ${uri.path}')
    //         return
    //     }
    //     const nextToken = headOrTail === 'head' ? stream.previous?.token : stream.next?.token
    //     try {
    //         // TODO: Consider getPaginatedAwsCallIter? Would need a way to differentiate between head/tail...
    //         const logEvents = filterLogEventsFromUriComponentsFn
    //             ? await filterLogEventsFromUriComponentsFn(logGroupInfo, filterParameters, nextToken)
    //             : await this.filterLogEventsFromUriComponents(logGroupInfo, filterParameters, nextToken)
    //         const newData =
    //             headOrTail === 'head'
    //                 ? (logEvents.events ?? []).concat(stream.data)
    //                 : stream.data.concat(logEvents.events ?? [])

    //         const tokens: Pick<CloudWatchLogStreamData, 'next' | 'previous'> = {}
    //         // update if no token exists or if the token is updated in the correct direction.
    //         if (!stream.previous || headOrTail === 'head') {
    //             tokens.previous = {
    //                 token: logEvents.nextToken,
    //             }
    //         }
    //         if (!stream.next || headOrTail === 'tail') {
    //             tokens.next = {
    //                 token: logEvents.nextToken,
    //             }
    //         }

    //         this.setLog(uri, {
    //             ...stream,
    //             ...tokens,
    //             data: newData,
    //         })

    //         this._onDidChange.fire(uri)
    //     } catch (e) {
    //         const err = e as Error
    //         vscode.window.showErrorMessage(
    //             localize(
    //                 'AWS.cloudWatchLogs.viewLogStream.errorRetrievingLogs',
    //                 'Error retrieving logs for Log Stream {0} : {1}',
    //                 logGroupInfo.groupName,
    //                 err.message
    //             )
    //         )
    //     }
    // }

    public async updateLog(uri: vscode.Uri, headOrTail: 'head' | 'tail' = 'tail'): Promise<void> {
        const stream = this.getLog(uri)

        if (!stream) {
            getLogger().debug(`No registry entry for ${uri.path}`)
            return
        }
        const nextToken = headOrTail === 'head' ? stream.previous?.token : stream.next?.token
        // const logGroupInfo = parseCloudWatchLogsUri(uri)
        try {
            // TODO: Consider getPaginatedAwsCallIter? Would need a way to differentiate between head/tail...
            // Set default API call depending on parameters passed in.
            var logEvents
            if (stream.filterParameters) {
                // If we are trying to go backwards on filterLogEvents, just don't do anything
                if (headOrTail === 'head') {
                    return
                }
                logEvents = stream.logEventsAPICall
                    ? await stream.logEventsAPICall(stream.logGroupInfo, nextToken, stream.filterParameters)
                    : await this.filterLogEventsFromUriComponents(
                          stream.logGroupInfo,
                          nextToken,
                          stream.filterParameters
                      )
            } else {
                logEvents = stream.logEventsAPICall
                    ? await stream.logEventsAPICall(stream.logGroupInfo, nextToken)
                    : await this.getLogEventsFromUriComponents(stream.logGroupInfo, nextToken)
            }

            const newData =
                headOrTail === 'head'
                    ? (logEvents.events ?? []).concat(stream.data)
                    : stream.data.concat(logEvents.events ?? [])

            const tokens: Pick<CloudWatchLogData, 'next' | 'previous'> = {}
            // update if no token exists or if the token is updated in the correct direction.
            if (!stream.previous || headOrTail === 'head') {
                tokens.previous = {
                    token: logEvents.nextBackwardToken,
                }
            }
            if (!stream.next || headOrTail === 'tail') {
                tokens.next = {
                    token: logEvents.nextForwardToken,
                }
            }

            this.setLog(uri, {
                ...stream,
                ...tokens,
                data: newData,
                logGroupInfo: stream.logGroupInfo,
                logEventsAPICall: stream.logEventsAPICall,
                filterParameters: stream.filterParameters,
            })

            this._onDidChange.fire(uri)
        } catch (e) {
            const err = e as Error
            // TODO: stream might not have streamName if filterEvents is APICall. In this case, we want different error message.
            vscode.window.showErrorMessage(
                localize(
                    'AWS.cloudWatchLogs.viewLogStream.errorRetrievingLogs',
                    'Error retrieving logs for Log Stream {0} : {1}',
                    stream.logGroupInfo.streamName,
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

    private setLog(uri: vscode.Uri, stream: CloudWatchLogData): void {
        this.activeStreams.set(uri.path, stream)
    }

    private getLog(uri: vscode.Uri): CloudWatchLogData | undefined {
        return this.activeStreams.get(uri.path)
    }

    private async getLogEventsFromUriComponents(
        logGroupInfo: CloudWatchLogsLogGroupInfo,
        nextToken?: string
    ): Promise<CloudWatchAPIResponse> {
        const client: CloudWatchLogsClient = globals.toolkitClientBuilder.createCloudWatchLogsClient(
            logGroupInfo.regionName
        )
        if (!logGroupInfo.streamName) {
            throw new Error(`getLogEvents is called on group ${logGroupInfo.groupName} without a stream specified.`)
        }
        const response = await client.getLogEvents({
            logGroupName: logGroupInfo.groupName,
            logStreamName: logGroupInfo.streamName,
            nextToken,
            limit: this.configuration.get('limit', 1000),
        })

        return {
            events: response.events,
            nextForwardToken: response.nextForwardToken,
            nextBackwardToken: response.nextBackwardToken,
        }
    }
    public async filterLogEventsFromUriComponents(
        logGroupInfo: CloudWatchLogsLogGroupInfo,
        nextToken?: string,
        filterParameters?: {
            filterPattern: string
            startTime: integer
        }
    ): Promise<CloudWatchAPIResponse> {
        const client: CloudWatchLogsClient = globals.toolkitClientBuilder.createCloudWatchLogsClient(
            logGroupInfo.regionName
        )

        const response = await client.filterLogEvents({
            logGroupName: logGroupInfo.groupName,
            nextToken: nextToken,
            filterPattern: filterParameters ? filterParameters.filterPattern : '',
            startTime: filterParameters ? filterParameters.startTime : 0,
            limit: this.configuration.get('limit', 1000),
        })

        // NOTE: We make the assumption here that the previous next token would allow us to move backwards in the search.
        // This isn't true if data is changing, but use case might not exist.
        return {
            events: response.events,
            nextBackwardToken: nextToken,
            nextForwardToken: response.nextToken,
        }
    }
}

export class CloudWatchLogData {
    data: CloudWatchLogs.OutputLogEvents = []
    logGroupInfo!: CloudWatchLogsLogGroupInfo
    next?: {
        token: CloudWatchLogs.NextToken | undefined
    }
    previous?: {
        token: CloudWatchLogs.NextToken | undefined
    }
    busy: boolean = false
    filterParameters?: {
        filterPattern: string
        startTime: integer
    }
    logEventsAPICall?: CloudWatchAPICall
}

export interface CloudWatchAPIResponse {
    events?: CloudWatchLogs.FilteredLogEvents
    nextForwardToken?: CloudWatchLogs.NextToken
    nextBackwardToken?: CloudWatchLogs.NextToken
}

export interface CloudWatchLogsLogGroupInfo {
    groupName: string
    regionName: string
    streamName?: string
}

export type CloudWatchAPICall = (
    logGroupInfo: CloudWatchLogsLogGroupInfo,
    nextToken?: string,
    filterParameters?: {
        filterPattern: string
        startTime: integer
    }
) => Promise<CloudWatchAPIResponse>
