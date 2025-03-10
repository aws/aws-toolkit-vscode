/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import * as AWS from '@aws-sdk/types'
import {
    CloudWatchLogsClient,
    StartLiveTailCommand,
    StartLiveTailResponseStream,
} from '@aws-sdk/client-cloudwatch-logs'
import { LogStreamFilterResponse } from '../wizard/liveTailLogStreamSubmenu'
import { CloudWatchLogsSettings } from '../cloudWatchLogsUtils'
import globals from '../../../shared/extensionGlobals'
import { Settings } from '../../../shared/settings'
import { ToolkitError } from '../../../shared/errors'
import { createLiveTailURIFromArgs } from './liveTailSessionRegistry'
import { getUserAgent } from '../../../shared/telemetry/util'
import { convertToTimeString } from '../../../shared/datetime'

export type LiveTailSessionConfiguration = {
    logGroupArn: string
    logStreamFilter?: LogStreamFilterResponse
    logEventFilterPattern?: string
    region: string
    awsCredentials: AWS.Credentials
}

export type LiveTailSessionClient = {
    cwlClient: CloudWatchLogsClient
    abortController: AbortController
}

export class LiveTailSession {
    private liveTailClient: LiveTailSessionClient
    private _logGroupArn: string
    private logStreamFilter?: LogStreamFilterResponse
    private logEventFilterPattern?: string
    private _maxLines: number
    private _uri: vscode.Uri
    private statusBarItem: vscode.StatusBarItem
    private startTime: number | undefined
    private endTime: number | undefined
    private _eventRate: number
    private _isSampled: boolean

    // While session is running, used to update the StatusBar each half second.
    private statusBarUpdateTimer: NodeJS.Timer | undefined

    static settings = new CloudWatchLogsSettings(Settings.instance)

    public constructor(configuration: LiveTailSessionConfiguration) {
        this._logGroupArn = configuration.logGroupArn
        this.logStreamFilter = configuration.logStreamFilter
        this.logEventFilterPattern = configuration.logEventFilterPattern
        this.liveTailClient = {
            cwlClient: new CloudWatchLogsClient({
                credentials: configuration.awsCredentials,
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

    public get logGroupArn() {
        return this._logGroupArn
    }

    public set eventRate(rate: number) {
        this._eventRate = rate
    }

    public set isSampled(isSampled: boolean) {
        this._isSampled = isSampled
    }

    public async startLiveTailSession(): Promise<AsyncIterable<StartLiveTailResponseStream>> {
        const commandOutput = await this.liveTailClient.cwlClient.send(this.buildStartLiveTailCommand(), {
            abortSignal: this.liveTailClient.abortController.signal,
        })
        if (!commandOutput.responseStream) {
            throw new ToolkitError('LiveTail session response stream is undefined.')
        }
        this.startTime = globals.clock.Date.now()
        this.endTime = undefined
        this.statusBarUpdateTimer = globals.clock.setInterval(() => {
            this.updateStatusBarItemText()
        }, 500)
        return commandOutput.responseStream
    }

    public stopLiveTailSession() {
        this.endTime = globals.clock.Date.now()
        this.statusBarItem.dispose()
        globals.clock.clearInterval(this.statusBarUpdateTimer)
        this.liveTailClient.abortController.abort()
        this.liveTailClient.cwlClient.destroy()
    }

    public getLiveTailSessionDuration(): number {
        // Never started
        if (this.startTime === undefined) {
            return 0
        }
        // Currently running
        if (this.endTime === undefined) {
            return globals.clock.Date.now() - this.startTime
        }
        return this.endTime - this.startTime
    }

    public buildStartLiveTailCommand(): StartLiveTailCommand {
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
            logGroupIdentifiers: [this.logGroupArn],
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
        this.statusBarItem.text = `Tailing: ${timeString}, ${this._eventRate} events/sec, Sampled: ${sampledString}`
    }

    public get isAborted() {
        return this.liveTailClient.abortController.signal.aborted
    }
}
