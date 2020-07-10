/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as moment from 'moment'
import * as vscode from 'vscode'
import { CloudWatchLogs } from 'aws-sdk'
import { convertUriToLogGroupInfo } from '../utils'
import { CloudWatchLogsClient } from '../../shared/clients/cloudWatchLogsClient'
import { ext } from '../../shared/extensionGlobals'
import { getLogger } from '../../shared/logger'

/**
 * Class which contains CRUD operations and persistence for CloudWatch Logs streams.
 */
export class LogStreamRegistry {
    private readonly activeStreams: Map<string, CloudWatchLogStreamData>

    public constructor() {
        this.activeStreams = new Map<string, CloudWatchLogStreamData>()
    }

    /**
     * Returns whether or not the log is registered.
     * @param uri Document URI
     */
    public hasLog(uri: vscode.Uri): boolean {
        return this.activeStreams.has(uri.path)
    }

    /**
     * Adds a log to the registry if it didn't previously exist. No impact on existing log entries.
     * @param uri Document URI
     */
    public async addLog(uri: vscode.Uri): Promise<void> {
        if (!this.hasLog(uri)) {
            this.setLog(uri, new CloudWatchLogStreamData())
            await this.updateLogContent(uri, 'tail')
        }
    }

    /**
     * Returns the currently-held log content for a URI as a formatted string.
     * @param uri Document URI
     * @param formatting Optional params for outputting log messages.
     */
    public getLogContent(uri: vscode.Uri, formatting?: { timestamps?: boolean }): string | undefined {
        const currData = this.activeStreams.get(uri.path)

        if (!currData) {
            return undefined
        }

        let output: string = ''
        for (const data of currData.data) {
            let line: string = data.message ?? ''
            if (formatting?.timestamps) {
                // moment().format() matches console timestamp, e.g.: 2019-03-04T11:40:08.781-08:00
                // if no timestamp for some reason, entering a blank of equal length (29 characters)
                const timestamp = data.timestamp ? moment(data.timestamp).format() : '                             '
                line = timestamp.concat('\t', line)
            }
            output = output.concat(line)
        }

        return output
    }

    /**
     * Retrieves the next set of data for a log and adds it to the registry. Data can either be added to the front of the log ('head') or end ('tail')
     * @param uri Document URI
     * @param headOrTail Determines update behavior: 'head' retrieves the most recent previous token and appends data to the top of the log, 'tail' does the opposite.
     */
    public async updateLogContent(uri: vscode.Uri, headOrTail: 'head' | 'tail'): Promise<void> {
        const stream = this.activeStreams.get(uri.path)
        if (!stream) {
            getLogger().debug('Log stream not active. Call addLog() first.')
            return
        }
        // TODO: append next/previous token to stream object
        const logGroupInfo = convertUriToLogGroupInfo(uri)
        try {
            const client: CloudWatchLogsClient = ext.toolkitClientBuilder.createCloudWatchLogsClient(
                logGroupInfo.regionName
            )
            // TODO: append next/previous token
            const logEvents = await client.getLogEvents({
                logGroupName: logGroupInfo.groupName,
                logStreamName: logGroupInfo.streamName,
            })
            const newData =
                headOrTail === 'head'
                    ? (logEvents.events ?? []).concat(stream.data)
                    : stream.data.concat(logEvents.events ?? [])
            this.setLog(uri, {
                ...stream,
                data: newData,
            })
        } catch (e) {
            const err = e as Error
            vscode.window.showErrorMessage(
                localize(
                    'aws.cloudWatchLogs.viewLogStream.errorRetrievingLogs',
                    'Error retrieving logs for Log Stream {0} : {1}',
                    logGroupInfo.streamName,
                    err.message
                )
            )
        }
    }

    /**
     * Deletes a stream from the registry.
     * @param uri Document URI
     */
    public deleteLogContent(uri: vscode.Uri) {
        this.activeStreams.delete(uri.path)
    }

    private setLog(uri: vscode.Uri, stream: CloudWatchLogStreamData) {
        this.activeStreams.set(uri.path, stream)
    }
}

class CloudWatchLogStreamData {
    data: CloudWatchLogs.OutputLogEvents = []
    next?: {
        token: CloudWatchLogs.NextToken
        expiry: Date
    }
    previous?: {
        token: CloudWatchLogs.NextToken
        expiry: Date
    }
    mostRecentExpiry?: Date
}
