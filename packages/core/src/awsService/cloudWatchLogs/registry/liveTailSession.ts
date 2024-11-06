/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import {
    CloudWatchLogsClient,
    StartLiveTailCommand,
    StartLiveTailResponseStream,
} from '@aws-sdk/client-cloudwatch-logs'
import { LogStreamFilterResponse } from '../wizard/liveTailLogStreamSubmenu'
import { CloudWatchLogsSettings } from '../cloudWatchLogsUtils'
import { convertToTimeString, Settings, ToolkitError } from '../../../shared'
import { createLiveTailURIFromArgs } from './liveTailSessionRegistry'
import { getUserAgent } from '../../../shared/telemetry/util'

export type LiveTailSessionConfiguration = {
    logGroupName: string
    logStreamFilter?: LogStreamFilterResponse
    logEventFilterPattern?: string
    region: string
}

export type LiveTailSessionClient = {
    cwlClient: CloudWatchLogsClient
    abortController: AbortController
}

export class LiveTailSession {
    private liveTailClient: LiveTailSessionClient
    private _logGroupName: string
    private logStreamFilter?: LogStreamFilterResponse
    private logEventFilterPattern?: string
    private _maxLines: number
    private _uri: vscode.Uri
    private statusBarItem: vscode.StatusBarItem
    private startTime: number | undefined
    private endTime: number | undefined
    private _eventRate: number
    private _isSampled: boolean

    static settings = new CloudWatchLogsSettings(Settings.instance)

    public constructor(configuration: LiveTailSessionConfiguration) {
        this._logGroupName = configuration.logGroupName
        this.logStreamFilter = configuration.logStreamFilter
        this.liveTailClient = {
            cwlClient: new CloudWatchLogsClient({
                region: configuration.region,
                customUserAgent: getUserAgent(),
            }),
            abortController: new AbortController(),
        }
        this._maxLines = LiveTailSession.settings.get('limit', 10000)
        this._uri = createLiveTailURIFromArgs(configuration)
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 0)
        this._eventRate = 0
        this._isSampled = false
    }

    public get maxLines() {
        return this._maxLines
    }

    public get uri() {
        return this._uri
    }

    public get logGroupName() {
        return this._logGroupName
    }

    public set eventRate(rate: number) {
        this._eventRate = rate
    }

    public set isSampled(isSampled: boolean) {
        this._isSampled = isSampled
    }

    public async startLiveTailSession(): Promise<AsyncIterable<StartLiveTailResponseStream>> {
        const command = this.buildStartLiveTailCommand()
        try {
            const commandOutput = await this.liveTailClient.cwlClient.send(command, {
                abortSignal: this.liveTailClient.abortController.signal,
            })
            if (!commandOutput.responseStream) {
                throw new ToolkitError('LiveTail session response stream is undefined.')
            }
            this.startTime = Date.now()
            this.endTime = undefined
            return commandOutput.responseStream
        } catch (e) {
            throw new ToolkitError('Encountered error while trying to start LiveTail session.')
        }
    }

    public stopLiveTailSession() {
        this.endTime = Date.now()
        this.statusBarItem.dispose()
        this.liveTailClient.abortController.abort()
        this.liveTailClient.cwlClient.destroy()
    }

    public getLiveTailSessionDuration(): number {
        //Never started
        if (this.startTime === undefined) {
            return 0
        }
        //Currently running
        if (this.endTime === undefined) {
            return Date.now() - this.startTime
        }
        return this.endTime - this.startTime
    }

    private buildStartLiveTailCommand(): StartLiveTailCommand {
        let logStreamNamePrefix = undefined
        let logStreamName = undefined
        if (this.logStreamFilter) {
            if (this.logStreamFilter.type === 'prefix') {
                logStreamNamePrefix = this.logStreamFilter.filter
                logStreamName = undefined
            } else if (this.logStreamFilter.type === 'specific') {
                logStreamName = this.logStreamFilter.filter
                logStreamNamePrefix = undefined
            }
        }

        return new StartLiveTailCommand({
            logGroupIdentifiers: [this.logGroupName],
            logStreamNamePrefixes: logStreamNamePrefix ? [logStreamNamePrefix] : undefined,
            logStreamNames: logStreamName ? [logStreamName] : undefined,
            logEventFilterPattern: this.logEventFilterPattern ? this.logEventFilterPattern : undefined,
        })
    }

    public showStatusBarItem(shouldShow: boolean) {
        shouldShow ? this.statusBarItem.show() : this.statusBarItem.hide()
    }

    public updateStatusBarItemText() {
        const elapsedTime = this.getLiveTailSessionDuration()
        const timeString = convertToTimeString(elapsedTime)
        const sampledString = this._isSampled ? 'Yes' : 'No'
        this.statusBarItem.text = `Tailing Session: ${timeString}, ${this._eventRate} events/sec, Sampled: ${sampledString}`
    }
}
