/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { LogTopic, type ToolkitLogger } from './toolkitLogger'

const toolkitLoggers: {
    main: Logger | undefined
    debugConsole: Logger | undefined
} = { main: undefined, debugConsole: undefined }

export interface Logger {
    /**
     * Developer-only: Optional log file, which gets all log messages (regardless of the configured
     * log-level).
     */
    logFile?: vscode.Uri
    debug(message: string | Error, ...meta: any[]): number
    verbose(message: string | Error, ...meta: any[]): number
    info(message: string | Error, ...meta: any[]): number
    warn(message: string | Error, ...meta: any[]): number
    error(message: string | Error, ...meta: any[]): number
    log(logLevel: LogLevel, message: string | Error, ...meta: any[]): number
    setLogLevel(logLevel: LogLevel): void
    /** Returns true if the given log level is being logged.  */
    logLevelEnabled(logLevel: LogLevel): boolean
    getLogById(logID: number, file: vscode.Uri): string | undefined
    /** HACK: Enables logging to vscode Debug Console. */
    enableDebugConsole(): void
}

export abstract class BaseLogger implements Logger {
    logFile?: vscode.Uri

    debug(message: string | Error, ...meta: any[]): number {
        return this.sendToLog('debug', message, ...meta)
    }
    verbose(message: string | Error, ...meta: any[]): number {
        return this.sendToLog('verbose', message, ...meta)
    }
    info(message: string | Error, ...meta: any[]): number {
        return this.sendToLog('info', message, ...meta)
    }
    warn(message: string | Error, ...meta: any[]): number {
        return this.sendToLog('warn', message, ...meta)
    }
    error(message: string | Error, ...meta: any[]): number {
        return this.sendToLog('error', message, ...meta)
    }
    log(logLevel: LogLevel, message: string | Error, ...meta: any[]): number {
        return this.sendToLog(logLevel, message, ...meta)
    }
    abstract setLogLevel(logLevel: LogLevel): void
    abstract logLevelEnabled(logLevel: LogLevel): boolean
    abstract getLogById(logID: number, file: vscode.Uri): string | undefined
    /** HACK: Enables logging to vscode Debug Console. */
    abstract enableDebugConsole(): void

    abstract sendToLog(
        logLevel: 'debug' | 'verbose' | 'info' | 'warn' | 'error',
        message: string | Error,
        ...meta: any[]
    ): number
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

export function fromVscodeLogLevel(logLevel: vscode.LogLevel): LogLevel {
    if (!vscode.LogLevel) {
        // vscode version <= 1.73
        return 'info'
    }

    switch (logLevel) {
        case vscode.LogLevel.Trace:
        case vscode.LogLevel.Debug:
            return 'debug'
        case vscode.LogLevel.Info:
            return 'info'
        case vscode.LogLevel.Warning:
            return 'warn'
        case vscode.LogLevel.Error:
        case vscode.LogLevel.Off:
        default:
            return 'error'
    }
}

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
 * the logger is of `'main'` or `undefined`: Main logger; default impl: logs to log file and log output channel
 * @param topic: topic to be appended in front of the message.
 */
export function getLogger(topic?: LogTopic): Logger {
    const logger = toolkitLoggers['main']
    if (!logger) {
        return new ConsoleLogger()
    }
    /**
     * need this check so that setTopic can be recognized
     * using instanceof would lead to dependency loop error
     */
    if (isToolkitLogger(logger)) {
        logger.setTopic(topic)
    }
    return logger
}

/**
 * check if the logger is of type `ToolkitLogger`. This avoids Circular Dependencies, but `instanceof ToolkitLogger` is preferred.
 * @param logger
 * @returns bool, true if is `ToolkitLogger`
 */
function isToolkitLogger(logger: Logger): logger is ToolkitLogger {
    return 'setTopic' in logger && typeof logger.setTopic === 'function'
}

export function getDebugConsoleLogger(topic?: LogTopic): Logger {
    const logger = toolkitLoggers['debugConsole']
    if (!logger) {
        return new ConsoleLogger()
    }
    if (isToolkitLogger(logger)) {
        logger.setTopic(topic)
    }
    return logger
}

export class NullLogger extends BaseLogger {
    public setLogLevel(logLevel: LogLevel) {}
    public logLevelEnabled(logLevel: LogLevel): boolean {
        return false
    }
    public getLogById(logID: number, file: vscode.Uri): string | undefined {
        return undefined
    }
    public enableDebugConsole(): void {}
    override sendToLog(
        logLevel: 'error' | 'warn' | 'info' | 'verbose' | 'debug',
        message: string | Error,
        ...meta: any[]
    ): number {
        return 0
    }
}

/**
 * Fallback used if {@link getLogger()} is requested before logging is fully initialized.
 */
export class ConsoleLogger extends BaseLogger {
    public setLogLevel(logLevel: LogLevel) {}
    public logLevelEnabled(logLevel: LogLevel): boolean {
        return false
    }
    public getLogById(logID: number, file: vscode.Uri): string | undefined {
        return undefined
    }
    public enableDebugConsole(): void {}
    override sendToLog(
        logLevel: 'error' | 'warn' | 'info' | 'verbose' | 'debug',
        message: string | Error,
        ...meta: any[]
    ): number {
        /**
         * This is here because we pipe verbose to debug currentlly
         * TODO: remove in the next stage
         */
        if (logLevel === 'verbose') {
            // eslint-disable-next-line aws-toolkits/no-console-log
            console.debug(message, ...meta)
        } else {
            // eslint-disable-next-line aws-toolkits/no-console-log
            console[logLevel](message, ...meta)
        }
        return 0
    }
}

export function getNullLogger(type?: 'debugConsole' | 'main'): Logger {
    return new NullLogger()
}
/**
 * Sets (or clears) the logger that is accessible to code.
 * The Extension is expected to call this only once per log type.
 * Tests should call this to set up a logger prior to executing code that accesses a logger.
 */
export function setLogger(logger: Logger | undefined, type?: 'debugConsole' | 'main') {
    toolkitLoggers[type ?? 'main'] = logger
}
