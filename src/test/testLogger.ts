/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Loggable, Logger, LogLevel } from '../shared/logger'
import { compareLogLevel } from '../shared/logger/logger'

/**
 * In-memory Logger implementation suitable for use by tests.
 */
export class TestLogger implements Logger {
    private readonly loggedEntries: {
        logLevel: LogLevel
        entry: Loggable
    }[] = []

    public constructor(private logLevel: LogLevel = 'debug') {}

    public debug(...message: Loggable[]): void {
        this.addLoggedEntries('debug', message)
    }

    public verbose(...message: Loggable[]): void {
        this.addLoggedEntries('verbose', message)
    }

    public info(...message: Loggable[]): void {
        this.addLoggedEntries('info', message)
    }

    public warn(...message: Loggable[]): void {
        this.addLoggedEntries('warn', message)
    }

    public error(...message: Loggable[]): void {
        this.addLoggedEntries('error', message)
    }

    public getLoggedEntries(...logLevels: LogLevel[]): Loggable[] {
        return this.loggedEntries
            .filter(loggedEntry => logLevels.length === 0 || logLevels.includes(loggedEntry.logLevel))
            .map(loggedEntry => loggedEntry.entry)
    }

    private addLoggedEntries(logLevel: LogLevel, entries: Loggable[]) {
        entries.forEach(entry => {
            this.loggedEntries.push({
                logLevel,
                entry,
            })
        })
    }

    public setLogLevel(logLevel: LogLevel) {
        this.logLevel = logLevel
    }

    public logLevelEnabled(logLevel: LogLevel): boolean {
        const currentLevel = this.logLevel as LogLevel
        return compareLogLevel(currentLevel, logLevel) >= 0
    }
}
