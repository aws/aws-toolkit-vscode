/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import TransportStream from 'winston-transport'
import fs from '../fs/fs'
import * as vscode from 'vscode'
import globals from '../extensionGlobals'
import { MESSAGE } from './consoleLogTransport'
import { ToolkitLogger } from './toolkitLogger'

interface LogEntry {
    level: string
    message: string
    /** This is the formatted message from {@link ToolkitLogger} in the winston.createLogger() call */
    [MESSAGE]: string
}

export const flushIntervalMillis = 1000

/**
 * TODO: Figure out why the log file is not being properly appended to
 *
 * Problem:
 * - Doing multiple log calls will not properly append to the log file
 * - Only the last log call is written to the log file
 * - Looking in to the append() call, when it first reads the current content
 *   it would not have any of the previous logs in it.
 * - The `next()` method is intended to signal that the current log is done being
 *   written to the file but that is not working by the looks of it.
 * Temporary Solution:
 * - I created a buffer that buffers incoming logs and batch writes them after
 *   a certain timeout. This seems to improve things
 * - Also the current append implementation is inefficient due to the underlying api
 *   (reads whole file, concatenates, then writes) so buffering is beneficial here.
 */
export class SharedFileTransport extends TransportStream {
    private logFile: vscode.Uri
    constructor(
        opts: TransportStream.TransportStreamOptions & { logFile: vscode.Uri },
        private readonly append = (f: vscode.Uri, s: string) => fs.appendFile(f, s)
    ) {
        super(opts)
        this.logFile = opts.logFile
    }

    private flushTimeout: NodeJS.Timeout | undefined
    private bufferedLogEntries: LogEntry[] = []
    private resolvesAfterLogsWritten: Promise<void> | undefined
    private doResolve: (() => void) | undefined

    /**
     * @returns a promise that resolves once a batch of logs are written to
     *          the log file.
     */
    public override log(logEntry: LogEntry, next: () => void): Promise<void> {
        this.bufferedLogEntries.push(logEntry)

        if (!this.resolvesAfterLogsWritten) {
            // we create a promise which resolves once logs are written to the file
            this.resolvesAfterLogsWritten = new Promise((resolve) => {
                this.doResolve = resolve.bind(this)
            })
        }

        if (!this.flushTimeout) {
            // start timeout to flush buffer after specific time passes
            this.flushTimeout = globals.clock.setTimeout(async () => {
                this.flushTimeout = undefined

                // Clear current promise objs so new calls to log() will
                // create new promise objs. Must happen before we call flushBufferedLogs()
                this.resolvesAfterLogsWritten = undefined
                const doResolve = this.doResolve
                this.doResolve = undefined

                // Write all logs to the file
                await this.flushBufferedLogs()

                // signals to anyone awaiting this function that logs have been
                // written to the file.
                doResolve!()
            }, flushIntervalMillis)
        }

        next()
        return this.resolvesAfterLogsWritten
    }

    /** Writes all buffered logs to the file */
    private async flushBufferedLogs(): Promise<void> {
        const latestLogIndex = this.bufferedLogEntries.length - 1

        if (latestLogIndex < 0) {
            // no logs to write to file
            return
        }

        const logMessages = this.bufferedLogEntries.map((logEntry) => logEntry[MESSAGE])

        // Remove the logs that were written to the file from the buffer.
        // But we have to keep in mind new logs may have been
        // asynchronously added to the buffer, so we only remove what we have flushed.
        this.bufferedLogEntries = this.bufferedLogEntries.slice(latestLogIndex + 1)

        const newText = logMessages.join('\n') + '\n'
        await this.append(this.logFile, newText)
    }
}
