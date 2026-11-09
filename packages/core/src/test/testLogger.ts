/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Loggable, LogLevel } from '../shared/logger/logger'
import { BaseLogger, compareLogLevel } from '../shared/logger/logger'
import { Uri } from 'vscode'
import util from 'util'
import { isWeb } from '../shared'
import { inspect } from '../shared/utilities/collectionUtils'

/**
 * In-memory Logger implementation suitable for use by tests.
 */
export class TestLogger extends BaseLogger {
    private readonly loggedEntries: {
        logLevel: LogLevel
        entry: Loggable
    }[] = []
    private count: number = 0
    public constructor(private logLevel: LogLevel = 'debug') {
        super()
    }

    public getLoggedEntries(...logLevels: LogLevel[]): Loggable[] {
        return this.loggedEntries
            .filter((loggedEntry) => logLevels.length === 0 || logLevels.includes(loggedEntry.logLevel))
            .map((loggedEntry) => loggedEntry.entry)
    }

    public sendToLog(logLevel: LogLevel, msg: string, ...meta: any[]): number {
        return this.addLoggedEntries(logLevel, msg, ...meta)
    }

    private formatString(message: string, ...meta: any[]): string {
        // Want to avoid reimplementing nodes `format` so instead concat to end of string
        // Node's format implementation: https://github.com/nodejs/node/blob/3178a762d6a2b1a37b74f02266eea0f3d86603be/lib/internal/util/inspect.js#L2191-L2315
        return isWeb() ? [message, meta.map((s) => inspect(s))].join(' ') : util.format(message, ...meta)
    }

    private addLoggedEntries(logLevel: LogLevel, message: Loggable, ...meta: any[]): number {
        this.loggedEntries.push({
            logLevel,
            entry: typeof message === 'string' && meta.length > 0 ? this.formatString(message, ...meta) : message,
        })

        return this.count++
    }

    // No need to actually implement this. Log tracking is tested in toolkitLogger.test.ts
    public getLogById(logID: number, file: Uri): string | undefined {
        return undefined
    }

    public setLogLevel(logLevel: LogLevel) {
        this.logLevel = logLevel
    }

    public logLevelEnabled(logLevel: LogLevel): boolean {
        const currentLevel = this.logLevel as LogLevel
        return compareLogLevel(currentLevel, logLevel) >= 0
    }
}
