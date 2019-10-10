/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Loggable, Logger, LogLevel } from '../shared/logger'
import { setLogger } from '../shared/logger/logger'

export class TestLogger implements Logger {
    private readonly loggedEntries: {
        logLevel: LogLevel
        entry: Loggable
    }[] = []

    // TODO : CC : Implement
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
            .filter(loggedEntry => logLevels.length === 0 || logLevels.indexOf(loggedEntry.logLevel) !== -1)
            .map(loggedEntry => loggedEntry.entry)
    }

    private addLoggedEntries(logLevel: LogLevel, entries: Loggable[]) {
        entries.forEach(entry => {
            this.loggedEntries.push({
                logLevel,
                entry
            })
        })
    }
}

export function setupTestLogger(): TestLogger {
    const logger = new TestLogger()
    setLogger(logger)

    return logger
}

export function teardownTestLogger() {
    setLogger(undefined)
}
