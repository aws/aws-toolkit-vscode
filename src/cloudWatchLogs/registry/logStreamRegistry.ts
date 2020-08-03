/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as nls from 'vscode-nls'
const localize = nls.loadMessageBundle()

import * as moment from 'moment'
import * as vscode from 'vscode'
import { CloudWatchLogs } from 'aws-sdk'
import { parseCloudWatchLogsUri } from '../cloudWatchLogsUtils'
import { CloudWatchLogsClient } from '../../shared/clients/cloudWatchLogsClient'
import { ext } from '../../shared/extensionGlobals'
import { getLogger } from '../../shared/logger'

// TODO: Add debug logging statements

/**
 * Class which contains CRUD operations and persistence for CloudWatch Logs streams.
 */
export class LogStreamRegistry {
    private readonly _onDidChange: vscode.EventEmitter<vscode.Uri> = new vscode.EventEmitter<vscode.Uri>()

    public constructor(
        private readonly activeStreams: Map<string, CloudWatchLogStreamData> = new Map<
            string,
            CloudWatchLogStreamData
        >()
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
        getLogEventsFromUriComponentsFn?: (logGroupInfo: {
            groupName: string
            streamName: string
            regionName: string
        }) => Promise<CloudWatchLogs.GetLogEventsResponse>
    ): Promise<void> {
        // ensure this is a CloudWatchLogs URI; don't need the return value, just need to make sure it doesn't throw.
        parseCloudWatchLogsUri(uri)
        if (!this.hasLog(uri)) {
            this.setLog(uri, new CloudWatchLogStreamData())
            await this.updateLog(uri, 'tail', getLogEventsFromUriComponentsFn)
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
        const currData = this.getLog(uri)

        if (!currData) {
            return undefined
        }

        let output: string = ''
        for (const data of currData.data) {
            let line: string = data.message ?? ''
            if (formatting?.timestamps) {
                // moment().format() matches console timestamp, e.g.: 2019-03-04T11:40:08.781-08:00
                // if no timestamp for some reason, entering a blank of equal length (29 characters long)
                const timestamp = data.timestamp ? moment(data.timestamp).format() : '                             '
                line = timestamp.concat('\t', line)
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
    public async updateLog(
        uri: vscode.Uri,
        headOrTail: 'head' | 'tail' = 'tail',
        getLogEventsFromUriComponentsFn: (logGroupInfo: {
            groupName: string
            streamName: string
            regionName: string
        }) => Promise<CloudWatchLogs.GetLogEventsResponse> = getLogEventsFromUriComponents
    ): Promise<void> {
        const stream = this.getLog(uri)
        if (!stream) {
            getLogger().debug(`No registry entry for ${uri.path}`)
            return
        }
        // TODO: append next/previous token to stream object
        const logGroupInfo = parseCloudWatchLogsUri(uri)
        try {
            // TODO: append next/previous token
            const logEvents = await getLogEventsFromUriComponentsFn(logGroupInfo)
            const newData =
                headOrTail === 'head'
                    ? (logEvents.events ?? []).concat(stream.data)
                    : stream.data.concat(logEvents.events ?? [])
            this.setLog(uri, {
                ...stream,
                data: newData,
            })

            this._onDidChange.fire(uri)
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
    public deregisterLog(uri: vscode.Uri) {
        this.activeStreams.delete(uri.path)
    }

    /**
     * Gets an array of registered logs.
     * Logs are represented as the URI's path.
     */
    public getRegisteredLogs(): string[] {
        return [...this.activeStreams.keys()]
    }

    private setLog(uri: vscode.Uri, stream: CloudWatchLogStreamData): void {
        this.activeStreams.set(uri.path, stream)
    }

    private getLog(uri: vscode.Uri): CloudWatchLogStreamData | undefined {
        return this.activeStreams.get(uri.path)
    }
}

export class CloudWatchLogStreamData {
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

// TODO: Add pagination logic here
async function getLogEventsFromUriComponents(logGroupInfo: {
    groupName: string
    streamName: string
    regionName: string
}): Promise<CloudWatchLogs.GetLogEventsResponse> {
    const client: CloudWatchLogsClient = ext.toolkitClientBuilder.createCloudWatchLogsClient(logGroupInfo.regionName)

    // TODO: append next/previous token
    return await client.getLogEvents({
        logGroupName: logGroupInfo.groupName,
        logStreamName: logGroupInfo.streamName,
    })
}
