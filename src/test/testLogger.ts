/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Loggable, Logger, LogLevel } from '../shared/logger'
import { setLogger } from '../shared/logger/logger'

export class TestLogger implements Logger {
    // TODO : CC : Implement
    public debug(...message: Loggable[]): void {
        throw new Error('Method not implemented.')
    }

    public verbose(...message: Loggable[]): void {
        throw new Error('Method not implemented.')
    }

    public info(...message: Loggable[]): void {
        throw new Error('Method not implemented.')
    }

    public warn(...message: Loggable[]): void {
        throw new Error('Method not implemented.')
    }

    public error(...message: Loggable[]): void {
        throw new Error('Method not implemented.')
    }

    public getLoggedEntries(...logLevels: LogLevel[]): Loggable[] {
        return []
    }

    // function to filter only errors from Loggables
}

export function setupTestLogger(): TestLogger {
    const logger = new TestLogger()
    setLogger(logger)

    return logger
}

export function teardownTestLogger() {
    setLogger(undefined)
}
