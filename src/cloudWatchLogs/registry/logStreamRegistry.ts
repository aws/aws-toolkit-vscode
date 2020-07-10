/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { CloudWatchLogs } from 'aws-sdk'
import { convertUriToLogGroupInfo } from '../utils'
import { CloudWatchLogsClient } from '../../shared/clients/cloudWatchLogsClient'
import { ext } from '../../shared/extensionGlobals'

export class LogStreamRegistry {
    private static INSTANCE: LogStreamRegistry | undefined
    private readonly activeStreams: Map<string, CloudWatchLogStreamData>

    public constructor() {
        this.activeStreams = new Map<string, CloudWatchLogStreamData>()
    }

    public hasLog(uri: vscode.Uri): boolean {
        return this.activeStreams.has(uri.path)
    }

    /**
     *
     * @param uri URI of the document to add.
     */
    public async addLog(uri: vscode.Uri): Promise<void> {
        if (!this.hasLog(uri)) {
            this.setLog(uri, new CloudWatchLogStreamData())
            await this.updateLogContent(uri, 'tail')
        }
    }

    public getLogContent(uri: vscode.Uri, formatting?: { timestamps?: boolean }): string | undefined {
        const currData = this.activeStreams.get(uri.path)

        if (!currData) {
            return undefined
        }

        let output: string = ''
        for (const data of currData.data) {
            let line: string = data.message ?? ''
            if (formatting?.timestamps) {
                // TODO: format timestamp like console
                // TODO: match indent amount for no timestamp? or do something else?
                const timestamp = data.timestamp?.toString() ?? '        '
                line = timestamp.concat(' ', line)
            }
            output.concat('\n', line)
        }

        return output
    }

    public async updateLogContent(uri: vscode.Uri, headOrTail: 'head' | 'tail'): Promise<void> {
        const stream = this.activeStreams.get(uri.path)
        if (stream) {
            // let nextToken: string | undefined
            // if (headOrTail === 'head') {
            //     if ()
            // }
            const logGroupInfo = convertUriToLogGroupInfo(uri)
            const client: CloudWatchLogsClient = ext.toolkitClientBuilder.createCloudWatchLogsClient(
                logGroupInfo.regionName
            )
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
        }
    }

    public deleteLogContent(uri: vscode.Uri) {
        this.activeStreams.delete(uri.path)
    }

    private setLog(uri: vscode.Uri, stream: CloudWatchLogStreamData) {
        this.activeStreams.set(uri.path, stream)
    }

    /**
     * Returns the LogStreamRegistry singleton.
     * If the singleton doesn't exist, creates it.
     */
    public static getLogStreamRegistry(): LogStreamRegistry {
        if (!LogStreamRegistry.INSTANCE) {
            LogStreamRegistry.INSTANCE = new LogStreamRegistry()
        }

        return LogStreamRegistry.INSTANCE
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
