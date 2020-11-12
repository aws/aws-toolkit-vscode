/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as winston from 'winston'
import { ConsoleLogTransport } from './consoleLogTransport'
import { Logger, LogLevel, compareLogLevel } from './logger'
import { OutputChannelTransport } from './outputChannelTransport'
import { isError } from 'util'

export class WinstonToolkitLogger implements Logger, vscode.Disposable {
    private readonly logger: winston.Logger
    private disposed: boolean = false

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
        this.logger.add(new winston.transports.File({ filename: logPath }))
    }

    public logToOutputChannel(outputChannel: vscode.OutputChannel): void {
        this.logger.add(
            new OutputChannelTransport({
                outputChannel,
            })
        )
    }

    public logToConsole(): void {
        this.logger.add(new ConsoleLogTransport({}))
    }

    public debug(message: string | Error, ...meta: any[]): void {
        this.writeToLogs('debug', message, ...meta)
    }

    public verbose(message: string | Error, ...meta: any[]): void {
        this.writeToLogs('verbose', message, ...meta)
    }

    public info(message: string | Error, ...meta: any[]): void {
        this.writeToLogs('info', message, ...meta)
    }

    public warn(message: string | Error, ...meta: any[]): void {
        this.writeToLogs('warn', message, ...meta)
    }

    public error(message: string | Error, ...meta: any[]): void {
        this.writeToLogs('error', message, ...meta)
    }

    public dispose() {
        if (!this.disposed) {
            this.logger.close()
            this.logger.clear()
            this.disposed = true
        }
    }

    private writeToLogs(level: LogLevel, message: string | Error, ...meta: any[]): void {
        if (this.disposed) {
            throw new Error('Cannot write to disposed logger')
        }

        meta.filter(item => isError(item)).forEach(error => coerceNameToString(error))

        if (isError(message)) {
            coerceNameToString(message)
            this.logger.log(level, '%O', message, ...meta)
        } else {
            this.logger.log(level, message, ...meta)
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
