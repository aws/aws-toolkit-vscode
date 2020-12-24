/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

const toolkitLoggers: {
    main: Logger | undefined
    channel: Logger | undefined
    debug: Logger | undefined
} = { main: undefined, channel: undefined, debug: undefined }

export interface Logger {
    debug(message: string, ...meta: any[]): void
    debug(error: Error): void
    verbose(message: string, ...meta: any[]): void
    verbose(error: Error): void
    info(message: string, ...meta: any[]): void
    info(error: Error): void
    warn(message: string, ...meta: any[]): void
    warn(error: Error): void
    error(message: string, ...meta: any[]): void
    error(error: Error): void
    setLogLevel(logLevel: LogLevel): void
    /** Returns true if the given log level is being logged.  */
    logLevelEnabled(logLevel: LogLevel): boolean
}

/**
 * Log levels ordered for comparison.
 *
 * See https://github.com/winstonjs/winston#logging-levels :
 * > RFC5424: severity of levels is numerically ascending from most important
 * > to least important.
 */
const logLevels = new Map<LogLevel, number>([
    ['error', 1],
    ['warn', 2],
    ['info', 3],
    ['verbose', 4],
    ['debug', 5],
])

export type LogLevel = 'error' | 'warn' | 'info' | 'verbose' | 'debug'

/**
 * Compares log levels.
 *
 * @returns
 * - Zero if the log levels are equal
 * - Negative if `l1` is less than `l2`
 * - Positive if `l1` is greater than `l2`
 */
export function compareLogLevel(l1: LogLevel, l2: LogLevel): number {
    return logLevels.get(l1)! - logLevels.get(l2)!
}

/**
 * Gets the logger if it has been initialized
 * @param type Gets the logger type:
 * * `'main'` or `undefined`: Main logger; default impl: logs to log file and log output channel
 * * `'channel'`: Channel Logger; default impl: logs to the `main` channels and the `AWS Toolkit` output channel
 * * `'debug'`: Debug Console Logger; default impl: logs to the `channel` channels and the currently-active VS Code Debug Console pane.
 */
export function getLogger(type?: 'channel' | 'debug' | 'main'): Logger {
    const logger = toolkitLoggers[type ?? 'main']
    if (!logger) {
        throw new Error(
            'Logger not initialized. Extension code should call initialize() from shared/logger/activation, test code should call setLogger().'
        )
    }

    return logger
}

/**
 * Sets (or clears) the logger that is accessible to code.
 * The Extension is expected to call this only once per log type.
 * Tests should call this to set up a logger prior to executing code that accesses a logger.
 */
export function setLogger(logger: Logger | undefined, type?: 'channel' | 'debug' | 'main') {
    toolkitLoggers[type ?? 'main'] = logger
}
