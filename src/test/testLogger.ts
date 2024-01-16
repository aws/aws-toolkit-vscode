/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Loggable, Logger, LogLevel } from '../shared/logger'
import { compareLogLevel } from '../shared/logger/logger'
import { Uri } from 'vscode'

/**
 * In-memory Logger implementation suitable for use by tests.
 */
export class TestLogger implements Logger {
    private readonly loggedEntries: {
        logLevel: LogLevel
        entry: Loggable
    }[] = []
    private count: number = 0
    public constructor(private logLevel: LogLevel = 'debug') {}

    public enableDebugConsole(): void {}

    public debug(...message: Loggable[]): number {
        return this.addLoggedEntries('debug', message)
    }

    public verbose(...message: Loggable[]): number {
        return this.addLoggedEntries('verbose', message)
    }

    public info(...message: Loggable[]): number {
        return this.addLoggedEntries('info', message)
    }

    public warn(...message: Loggable[]): number {
        return this.addLoggedEntries('warn', message)
    }

    public error(...message: Loggable[]): number {
        return this.addLoggedEntries('error', message)
    }

    public getLoggedEntries(...logLevels: LogLevel[]): Loggable[] {
        return this.loggedEntries
            .filter(loggedEntry => logLevels.length === 0 || logLevels.includes(loggedEntry.logLevel))
            .map(loggedEntry => loggedEntry.entry)
    }

    private addLoggedEntries(logLevel: LogLevel, entries: Loggable[]): number {
        entries.forEach(entry => {
            this.loggedEntries.push({
                logLevel,
                entry,
            })
        })

        return this.count++
    }

    // No need to actually implement this. Log tracking is tested in winstonToolkitLogger.test.ts
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
