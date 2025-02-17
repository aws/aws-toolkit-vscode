/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

export type LogTopic = 'crashMonitoring' | 'dev/beta' | 'notifications' | 'test' | 'childProcess' | 'unknown' | 'chat'

class ErrorLog {
    constructor(
        public topic: string,
        public error: Error
    ) {}
}

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
    sendToLog(
        logLevel: 'debug' | 'verbose' | 'info' | 'warn' | 'error',
        message: string | Error,
        ...meta: any[]
    ): number
}

export abstract class BaseLogger implements Logger {
    logFile?: vscode.Uri
    topic: LogTopic = 'unknown'

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
    abstract sendToLog(
        logLevel: 'debug' | 'verbose' | 'info' | 'warn' | 'error',
        message: string | Error,
        ...meta: any[]
    ): number
    abstract setLogLevel(logLevel: LogLevel): void
    abstract logLevelEnabled(logLevel: LogLevel): boolean
    abstract getLogById(logID: number, file: vscode.Uri): string | undefined
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

/* Format the message with topic header */
function prependTopic(topic: string, message: string | Error): string | ErrorLog {
    if (typeof message === 'string') {
        // TODO: remove this after all calls are migrated and topic is a required param.
        if (topic === 'unknown') {
            return message
        }
        return `${topic}: ` + message
    } else if (message instanceof Error) {
        return new ErrorLog(topic, message)
    }
    return message
}

/**
 * Gets the global default logger.
 *
 * @param topic: topic to be appended in front of the message.
 */
export function getLogger(topic?: LogTopic): Logger {
    // `TopicLogger` will lazy-load the "main" logger when it becomes available.
    return new TopicLogger(topic ?? 'unknown', 'main')
}

export function getDebugConsoleLogger(topic?: LogTopic): Logger {
    // `TopicLogger` will lazy-load the "debugConsole" logger when it becomes available.
    return new TopicLogger(topic ?? 'unknown', 'debugConsole')
}

// jscpd:ignore-start
export class NullLogger extends BaseLogger {
    public setLogLevel(logLevel: LogLevel) {}
    public logLevelEnabled(logLevel: LogLevel): boolean {
        return false
    }
    public getLogById(logID: number, file: vscode.Uri): string | undefined {
        return undefined
    }
    override sendToLog(
        logLevel: 'error' | 'warn' | 'info' | 'verbose' | 'debug',
        message: string | Error,
        ...meta: any[]
    ): number {
        void logLevel
        void message
        void meta
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
    override sendToLog(
        logLevel: 'error' | 'warn' | 'info' | 'verbose' | 'debug',
        message: string | Error,
        ...meta: any[]
    ): number {
        // TODO: we alias "verbose" to "debug" currently. Will be revisited: IDE-14839
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

/**
 * Wraps the specified `ToolkitLogger` and defers to it for everything except `topic`.
 *
 * Falls back to `ConsoleLogger` when the logger isn't available yet (during startup).
 */
export class TopicLogger extends BaseLogger implements vscode.Disposable {
    // HACK: crude form of "lazy initialization", to support module-scope assignment of
    // `getLogger()` without being sensitive to module-load ordering. So even if logging isn't ready
    // at the time of the `getLogger` call, it will recover later. (This is a bit hacky, because it
    // arguably doesn't belong in `TopicLogger`.)
    public get logger() {
        return toolkitLoggers[this.loggerKey] ?? new ConsoleLogger()
    }

    /**
     * Wraps a `ToolkitLogger` and defers to it for everything except `topic`.
     */
    public constructor(
        public override topic: LogTopic,
        public readonly loggerKey: keyof typeof toolkitLoggers
    ) {
        super()
    }

    override setLogLevel(logLevel: LogLevel): void {
        this.logger.setLogLevel(logLevel)
    }

    override logLevelEnabled(logLevel: LogLevel): boolean {
        return this.logger.logLevelEnabled(logLevel)
    }

    override getLogById(logID: number, file: vscode.Uri): string | undefined {
        return this.logger.getLogById(logID, file)
    }

    override sendToLog(level: LogLevel, message: string | Error, ...meta: any[]): number {
        if (typeof message === 'string') {
            message = prependTopic(this.topic, message) as string
        }
        return this.logger.sendToLog(level, message, ...meta)
    }

    public async dispose(): Promise<void> {}
}
// jscpd:ignore-end

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

export type Loggable = Error | string
