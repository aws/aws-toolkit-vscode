/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { types } from 'util'
import * as vscode from 'vscode'
import * as winston from 'winston'
import { ConsoleLogTransport } from './consoleLogTransport'
import { DebugConsoleTransport } from './debugConsoleTransport'
import { Logger, LogLevel, compareLogLevel } from './logger'
import { OutputChannelTransport } from './outputChannelTransport'

// Need to limit how many logs are actually tracked
// LRU cache would work well, currently it just dumps the least recently added log
const LOGMAP_SIZE: number = 1000 
export class WinstonToolkitLogger implements Logger, vscode.Disposable {
    private readonly logger: winston.Logger
    private disposed: boolean = false
    private idCounter: number = 0
    private logMap: { [logID: number]: { [filePath: string]: string } } = {}

    public constructor(logLevel: LogLevel) {
        this.logger = winston.createLogger({
            format: winston.format.combine(
                winston.format.splat(),
                winston.format.timestamp({
                    format: 'YYYY-MM-DD HH:mm:ss',
                }),
                winston.format.errors({ stack: true }),
                winston.format.printf(info => {
                    return `${info.timestamp} [${info.level.toUpperCase()}]: ${info.message}`
                })
            ),
            level: logLevel,
        })
    }

    public setLogLevel(logLevel: LogLevel) {
        // Log calls are made with explicit levels to ensure the text is output
        this.logger.log(this.logger.level, `Setting log level to: ${logLevel}`)
        this.logger.level = logLevel
        this.logger.log(this.logger.level, `Log level is now: ${this.logger.level}`)
    }

    public logLevelEnabled(logLevel: LogLevel): boolean {
        const currentLevel = this.logger.level as LogLevel
        return compareLogLevel(currentLevel, logLevel) >= 0
    }

    public logToFile(logPath: string): void {
        const fileTransport: winston.transport = new winston.transports.File({ filename: logPath })
        fileTransport.on("logged", (obj: any) => this.parseLogObject(logPath, obj))
        this.logger.add(fileTransport)
    }

    public logToOutputChannel(outputChannel: vscode.OutputChannel, stripAnsi: boolean): void {
        const outputChannelTransport: winston.transport = new OutputChannelTransport({ 
            outputChannel,
            stripAnsi,
        })
        outputChannelTransport.on("logged", (obj: any) => this.parseLogObject(`channel://${outputChannel.name}`, obj))
        this.logger.add(outputChannelTransport)
    }

    public logToDebugConsole(): void {
        const debugConsoleTransport: winston.transport = new DebugConsoleTransport({ name: 'ActiveDebugConsole' })
        debugConsoleTransport.on("logged", (obj: any) => this.parseLogObject('console://debug', obj))
        this.logger.add(debugConsoleTransport)
    }

    public logToConsole(): void {
        const consoleLogTransport: winston.transport = new ConsoleLogTransport({})
        consoleLogTransport.on("logged", (obj: any) => this.parseLogObject('console://log', obj))
        this.logger.add(consoleLogTransport)
    }

    public debug(message: string | Error, ...meta: any[]): number {
        return this.writeToLogs('debug', message, ...meta)
    }

    public verbose(message: string | Error, ...meta: any[]): number {
        return this.writeToLogs('verbose', message, ...meta)
    }

    public info(message: string | Error, ...meta: any[]): number {
        return this.writeToLogs('info', message, ...meta)
    }

    public warn(message: string | Error, ...meta: any[]): number {
        return this.writeToLogs('warn', message, ...meta)
    }

    public error(message: string | Error, ...meta: any[]): number {
        return this.writeToLogs('error', message, ...meta)
    }

    public dispose() {
        if (!this.disposed) {
            this.logger.close()
            this.logger.clear()
            this.disposed = true
        }
    }

    private writeToLogs(level: LogLevel, message: string | Error, ...meta: any[]): number {
        if (this.disposed) {
            throw new Error('Cannot write to disposed logger')
        }

        meta.filter(item => types.isNativeError(item)).forEach(error => coerceNameToString(error))

        if (types.isNativeError(message)) {
            coerceNameToString(message)
            this.logger.log(level, '%O', message, ...meta, { logID: this.idCounter })
        } else {
            this.logger.log(level, message, ...meta, { logID: this.idCounter })
        }

        this.logMap[this.idCounter % LOGMAP_SIZE] = {}
        return this.idCounter++
    }

    /**
     * Attempts to get the mapped message corresponding to the provided file and logID. 
     * Log messages are considered 'stale' after a constant amount of new logs have been added.
     * 
     * @param logID  Unique ID associated with every log operation
     * @param file  Desired output file path. Can use "channel://NAME" and "console://NAME" for non-file transports.
     * 
     * @returns  Final log message. Stale or non-existant logs return undefined
     */
    public getTrackedLog(logID: number, file: string): string | undefined {
        // This prevents callers from getting stale logs
        if (this.idCounter - logID > LOGMAP_SIZE) {
            return undefined
        }

        if (this.logMap[logID % LOGMAP_SIZE]) {
            return this.logMap[logID % LOGMAP_SIZE][file]
        }
    }

    /**
     * Register this function to a Transport's 'logged' event to parse out the resulting meta data and log ID
     * Immediately records this log into logMap so it can be collected by an external caller
     * 
     * @param file  File that was written to
     * @param obj  Object passed from the event
     */
    private parseLogObject(file: string, obj: any): void {
        const logID: number | NamedNodeMap = parseInt(obj.logID) % LOGMAP_SIZE
        const symbols: symbol[] = Object.getOwnPropertySymbols(obj)
        const messageSymbol: symbol | undefined = symbols.find((s: symbol) => s.toString() === "Symbol(message)")

        if (logID && messageSymbol) {
            this.logMap[logID][file] = obj[messageSymbol]
        }
    }
}

/**
 * Workaround for logging Errors with a name that's not a string.
 *
 * e.g. AWS SDK for JS can sometimes set the error name to the error code number (like 404).
 *
 * Fixed in Node v12.14.1, can be removed once VSCode uses this version.
 * @see https://github.com/nodejs/node/issues/30572
 */
function coerceNameToString(error: any): void {
    if (typeof error.name === 'number') {
        error.name = String(error.name)
    }
}
