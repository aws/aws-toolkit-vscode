/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { normalize } from 'path'
import * as vscode from 'vscode'
import winston from 'winston'
import { DebugConsoleTransport } from './debugConsoleTransport'
import { Logger, LogLevel, compareLogLevel } from './logger'
import { OutputChannelTransport } from './outputChannelTransport'
import { isSourceMappingAvailable } from '../vscode/env'
import { formatError, ToolkitError, UnknownError } from '../errors'
import { isInBrowser } from '../../common/browserUtils'
import { SharedFileTransport } from './sharedFileTransport'
import { ConsoleLogTransport } from './consoleLogTransport'

// Need to limit how many logs are actually tracked
// LRU cache would work well, currently it just dumps the least recently added log
const logmapSize: number = 1000
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
                    if (info.raw) {
                        return info.message
                    }

                    return `${info.timestamp} [${info.level.toUpperCase()}]: ${info.message}`
                })
            ),
            level: logLevel,
        })
    }

    public setLogLevel(logLevel: LogLevel) {
        if (this.logger.level === logLevel) {
            return
        }
        // Log calls are made with explicit levels to ensure the text is output
        this.logger.level = logLevel
        this.logger.log(this.logger.level, `Log level: ${this.logger.level}`)
    }

    public logLevelEnabled(logLevel: LogLevel): boolean {
        const currentLevel = this.logger.level as LogLevel
        return compareLogLevel(currentLevel, logLevel) >= 0
    }

    public logToFile(logPath: vscode.Uri): void {
        let fileTransport: winston.transport
        if (isInBrowser()) {
            fileTransport = new SharedFileTransport({ logFile: logPath })
        } else {
            fileTransport = new winston.transports.File({ filename: logPath.fsPath })
        }

        const fileUri: vscode.Uri = vscode.Uri.file(normalize(logPath.fsPath))
        fileTransport.on('logged', (obj: any) => this.parseLogObject(fileUri, obj))
        this.logger.add(fileTransport)
    }

    public logToOutputChannel(outputChannel: vscode.OutputChannel, stripAnsi: boolean): void {
        const outputChannelTransport: winston.transport = new OutputChannelTransport({
            outputChannel,
            stripAnsi,
        })
        const channelUri: vscode.Uri = vscode.Uri.parse(`channel://${outputChannel.name}`)
        outputChannelTransport.on('logged', (obj: any) => this.parseLogObject(channelUri, obj))
        this.logger.add(outputChannelTransport)
    }

    public logToDebugConsole(): void {
        const debugConsoleTransport: winston.transport = new DebugConsoleTransport({ name: 'ActiveDebugConsole' })
        const debugConsoleUri: vscode.Uri = vscode.Uri.parse('console://debug')
        debugConsoleTransport.on('logged', (obj: any) => this.parseLogObject(debugConsoleUri, obj))
        this.logger.add(debugConsoleTransport)
    }

    public logToConsole(): void {
        const consoleLogTransport: winston.transport = new ConsoleLogTransport({})
        const logConsoleUri: vscode.Uri = vscode.Uri.parse('console://log')
        consoleLogTransport.on('logged', (obj: any) => this.parseLogObject(logConsoleUri, obj))
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

    public dispose(): Promise<void> {
        return this.disposed
            ? Promise.resolve()
            : new Promise<void>(resolve => {
                  this.disposed = true
                  // The 'finish' event is emitted after all underlying transports have emitted a 'finish' event: https://github.com/winstonjs/winston/blob/36586d3d30dfe32f9dd4fbabbd585e82d47d460d/lib/winston/logger.js#L316-L332
                  this.logger.once('finish', resolve)
                  this.logger.end()
              })
    }

    private mapError(level: LogLevel, err: Error): Error | string {
        // Use ToolkitError.trace even if we have source mapping (see below), because:
        // 1. it is what users will see, we want visibility into that when debugging
        // 2. it is often more useful than the stacktrace anyway
        if (err instanceof ToolkitError) {
            return err.trace
        }

        if (isSourceMappingAvailable() && level === 'error') {
            return err
        }

        return formatError(UnknownError.cast(err))
    }

    private writeToLogs(level: LogLevel, message: string | Error, ...meta: any[]): number {
        if (this.disposed) {
            throw new Error('Cannot write to disposed logger')
        }

        meta = meta.map(o => (o instanceof Error ? this.mapError(level, o) : o))

        if (message instanceof Error) {
            this.logger.log(level, '%O', message, ...meta, { logID: this.idCounter })
        } else {
            this.logger.log(level, message, ...meta, { logID: this.idCounter })
        }

        this.logMap[this.idCounter % logmapSize] = {}
        return this.idCounter++
    }

    /**
     * Attempts to get the mapped message corresponding to the provided file and logID.
     * Log messages are considered 'stale' after a constant amount of new logs have been added.
     *
     * @param logID  Unique ID associated with every log operation
     * @param file  Desired output file Uri. Debug console uses the uri 'console://debug' and output channel uses 'channel://output'
     *
     * @returns  Final log message. Stale or non-existant logs return undefined
     */
    public getLogById(logID: number, file: vscode.Uri): string | undefined {
        // Not possible, yell at the caller :(
        if (logID >= this.idCounter || logID < 0) {
            throw new Error(`Invalid log state, logID=${logID} must be in the range [0, ${this.idCounter})!`)
        }

        // This prevents callers from getting stale logs
        if (this.idCounter - logID > logmapSize) {
            return undefined
        }

        if (this.logMap[logID % logmapSize]) {
            return this.logMap[logID % logmapSize][file.toString(true)]
        }
    }

    /**
     * Register this function to a Transport's 'logged' event to parse out the resulting meta data and log ID
     * Immediately records this log into logMap so it can be collected by an external caller
     *
     * @param file  File that was written to
     * @param obj  Object passed from the event
     */
    private parseLogObject(file: vscode.Uri, obj: any): void {
        const logID: number = parseInt(obj.logID) % logmapSize
        const symbols: symbol[] = Object.getOwnPropertySymbols(obj)
        const messageSymbol: symbol | undefined = symbols.find((s: symbol) => s.toString() === 'Symbol(message)')

        if (this.logMap[logID] !== undefined && messageSymbol) {
            this.logMap[logID][file.toString(true)] = obj[messageSymbol]
        }
    }
}
