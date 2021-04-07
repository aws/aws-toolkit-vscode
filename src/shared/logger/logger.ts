/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

const toolkitLoggers: {
    main: Logger | undefined
    channel: Logger | undefined
    debugConsole: Logger | undefined
} = { main: undefined, channel: undefined, debugConsole: undefined }

export interface Logger {
    debug(message: string, ...meta: any[]): number
    debug(error: Error, ...meta: any[]): number
    verbose(message: string, ...meta: any[]): number
    verbose(error: Error, ...meta: any[]): number
    info(message: string, ...meta: any[]): number
    info(error: Error, ...meta: any[]): number
    warn(message: string, ...meta: any[]): number
    warn(error: Error, ...meta: any[]): number
    error(message: string, ...meta: any[]): number
    error(error: Error, ...meta: any[]): number
    setLogLevel(logLevel: LogLevel): void
    /** Returns true if the given log level is being logged.  */
    logLevelEnabled(logLevel: LogLevel): boolean
    getLogById(logID: number, file: string): string | undefined
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
export function getLogger(type?: 'channel' | 'debugConsole' | 'main'): Logger {
    const logger = toolkitLoggers[type ?? 'main']
    if (!logger) {
        throw new Error(
            'Logger not initialized. Extension code should call initialize() from shared/logger/activation, test code should call setLogger().'
        )
    }

    return logger
}

export class NullLogger implements Logger {
    public setLogLevel(logLevel: LogLevel) {}
    public logLevelEnabled(logLevel: LogLevel): boolean {
        return false
    }
    public debug(message: string | Error, ...meta: any[]): number {
        return 0
    }
    public verbose(message: string | Error, ...meta: any[]): number {
        return 0
    }
    public info(message: string | Error, ...meta: any[]): number {
        return 0
    }
    public warn(message: string | Error, ...meta: any[]): number {
        return 0
    }
    public error(message: string | Error, ...meta: any[]): number {
        return 0
    }
    public getLogById(logID: number, file: string): string | undefined {
        return undefined
    }
}

export function getNullLogger(type?: 'channel' | 'debugConsole' | 'main'): Logger {
    return new NullLogger()
}
/**
 * Sets (or clears) the logger that is accessible to code.
 * The Extension is expected to call this only once per log type.
 * Tests should call this to set up a logger prior to executing code that accesses a logger.
 */
export function setLogger(logger: Logger | undefined, type?: 'channel' | 'debugConsole' | 'main') {
    toolkitLoggers[type ?? 'main'] = logger
}
