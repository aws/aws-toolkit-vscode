/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

/** define log topics */
type LogTopic = 'Unknown' | 'Test'

const toolkitLoggers: {
    main: Logger | undefined
    debugConsole: Logger | undefined
} = { main: undefined, debugConsole: undefined }

export interface Logger {
    debug(message: string | Error, ...meta: any[]): number
    verbose(message: string | Error, ...meta: any[]): number
    info(message: string | Error, ...meta: any[]): number
    warn(message: string | Error, ...meta: any[]): number
    error(message: string | Error, ...meta: any[]): number
    setLogLevel(logLevel: LogLevel): void
    /** Returns true if the given log level is being logged.  */
    logLevelEnabled(logLevel: LogLevel): boolean
    getLogById(logID: number, file: vscode.Uri): string | undefined
    /** HACK: Enables logging to vscode Debug Console. */
    enableDebugConsole(): void
}

/**
 * Base Logger class
 * Used as a wrapper around the logger interface for appending messages
 * Also more compatible with future change
 */
abstract class baseLogger implements Logger {
    abstract coreLogger: Logger
    debug(message: string | Error, ...meta: any[]): number {
        return this.sendToLog('debug', message, meta)
    }
    verbose(message: string | Error, ...meta: any[]): number {
        return this.sendToLog('verbose', message, meta)
    }
    info(message: string | Error, ...meta: any[]): number {
        return this.sendToLog('info', message, meta)
    }
    warn(message: string | Error, ...meta: any[]): number {
        return this.sendToLog('warn', message, meta)
    }
    error(message: string | Error, ...meta: any[]): number {
        return this.sendToLog('error', message, meta)
    }
    setLogLevel(logLevel: LogLevel): void {
        this.coreLogger.setLogLevel(logLevel)
    }
    logLevelEnabled(logLevel: LogLevel): boolean {
        return this.coreLogger.logLevelEnabled(logLevel)
    }
    getLogById(logID: number, file: vscode.Uri): string | undefined {
        return this.coreLogger.getLogById(logID, file)
    }
    /** HACK: Enables logging to vscode Debug Console. */
    enableDebugConsole(): void {
        this.coreLogger.enableDebugConsole()
    }
    abstract sendToLog(
        type: 'debug' | 'verbose' | 'info' | 'warn' | 'error',
        message: string | Error,
        ...meta: any[]
    ): number
}
/**
 * Logger with topic headers
 *
 * @param topic identifies the message topic, appended to the front of message followed by a colen.
 * @param coreLogger the actual logger it wraps around, in this case the 'main' logger
 */
export class TopicLogger extends baseLogger {
    private topic: LogTopic
    override coreLogger: Logger
    /** Default topic is 'Unknown' */
    constructor(logger: Logger, topic: LogTopic = 'Unknown') {
        super()
        this.coreLogger = logger
        this.topic = topic
    }
    /** Format the message with topic header */
    private addTopicToMessage(message: string | Error): string | Error {
        const topicPrefix = `${this.topic}: `
        if (typeof message === 'string') {
            return topicPrefix + message
        } else if (message instanceof Error) {
            /** Create a new Error object to avoid modifying the original */
            const topicError = new Error(topicPrefix + message.message)
            topicError.name = message.name
            topicError.stack = message.stack
            return topicError
        }
        return message
    }
    override sendToLog(
        type: 'debug' | 'verbose' | 'info' | 'warn' | 'error',
        message: string | Error,
        ...meta: any[]
    ): number {
        return this.coreLogger[type](this.addTopicToMessage(message), meta)
    }
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
 * @param topic identifies the message topic, appended to the front of message followed by a colen.
 */
export function getLogger(topic?: LogTopic): Logger {
    const coreLogger = toolkitLoggers['main']
    if (!coreLogger) {
        return new ConsoleLogger()
    }
    /**
     * Temperpory check so we don't get a million Unknown logs
     * TODO: remove once the majority of log calls are migrated
     */
    if (!topic) {
        return coreLogger
    }
    return new TopicLogger(coreLogger, topic)
}

/**
 * Gets the logger if it has been initialized
 * the logger is of `'debugConsole', logs to IDE debug console channel
 * @param topic identifies the message topic, appended to the front of message followed by a colen.
 */
export function getDebugConsoleLogger(topic?: LogTopic): Logger {
    const baseLogger = toolkitLoggers['debugConsole']
    if (!baseLogger) {
        return new ConsoleLogger()
    }
    if (!topic) {
        return baseLogger
    }
    return new TopicLogger(baseLogger, topic)
}

export class NullLogger implements Logger {
    public setLogLevel(logLevel: LogLevel) {}
    public logLevelEnabled(logLevel: LogLevel): boolean {
        return false
    }
    public log(logLevel: LogLevel, message: string | Error, ...meta: any[]): number {
        return 0
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
    public getLogById(logID: number, file: vscode.Uri): string | undefined {
        return undefined
    }
    public enableDebugConsole(): void {}
}

/**
 * Fallback used if {@link getLogger()} is requested before logging is fully initialized.
 */
export class ConsoleLogger implements Logger {
    public setLogLevel(logLevel: LogLevel) {}
    public logLevelEnabled(logLevel: LogLevel): boolean {
        return false
    }
    public log(logLevel: LogLevel, message: string | Error, ...meta: any[]): number {
        switch (logLevel) {
            case 'error':
                this.error(message, ...meta)
                return 0
            case 'warn':
                this.warn(message, ...meta)
                return 0
            case 'verbose':
                this.verbose(message, ...meta)
                return 0
            case 'debug':
                this.debug(message, ...meta)
                return 0
            case 'info':
            default:
                this.info(message, ...meta)
                return 0
        }
    }
    public debug(message: string | Error, ...meta: any[]): number {
        // eslint-disable-next-line aws-toolkits/no-console-log
        console.debug(message, ...meta)
        return 0
    }
    public verbose(message: string | Error, ...meta: any[]): number {
        // eslint-disable-next-line aws-toolkits/no-console-log
        console.debug(message, ...meta)
        return 0
    }
    public info(message: string | Error, ...meta: any[]): number {
        // eslint-disable-next-line aws-toolkits/no-console-log
        console.info(message, ...meta)
        return 0
    }
    public warn(message: string | Error, ...meta: any[]): number {
        // eslint-disable-next-line aws-toolkits/no-console-log
        console.warn(message, ...meta)
        return 0
    }
    /** Note: In nodejs this prints to `stderr` (see {@link Console.error}). */
    public error(message: string | Error, ...meta: any[]): number {
        // eslint-disable-next-line aws-toolkits/no-console-log
        console.error(message, ...meta)
        return 0
    }
    public getLogById(logID: number, file: vscode.Uri): string | undefined {
        return undefined
    }
    public enableDebugConsole(): void {}
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
