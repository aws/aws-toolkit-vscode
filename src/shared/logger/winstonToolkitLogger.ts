/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as moment from 'moment'
import * as vscode from 'vscode'
import * as winston from 'winston'
import { ConsoleLogTransport } from './consoleLogTransport'
import { Loggable } from './loggableType'
import { Logger, LogLevel } from './logger'
import { OutputChannelTransport } from './outputChannelTransport'

function formatMessage(level: LogLevel, message: Loggable[]): string {
    // TODO : Look into winston custom formats - https://github.com/winstonjs/winston#creating-custom-formats
    let final: string = `${makeLogTimestamp()} [${level.toUpperCase()}]:`
    for (const chunk of message) {
        if (chunk instanceof Error) {
            final = `${final} ${chunk.stack}`
        } else {
            final = `${final} ${chunk}`
        }
    }

    return final
}

function makeLogTimestamp(): string {
    return moment().format('YYYY-MM-DD HH:mm:ss')
}

export class WinstonToolkitLogger implements Logger, vscode.Disposable {
    // forces winston to output only pre-formatted message
    private static readonly LOG_FORMAT = winston.format.printf(({ message }) => {
        return message
    })

    private readonly logger: winston.Logger
    private disposed: boolean = false

    public constructor(logLevel: LogLevel) {
        this.logger = winston.createLogger({
            format: winston.format.combine(WinstonToolkitLogger.LOG_FORMAT),
            level: logLevel
        })
    }

    public setLogLevel(logLevel: LogLevel) {
        this.logger.info(`Setting log level to: ${logLevel}`)
        this.logger.level = logLevel
    }

    public logToFile(logPath: string): void {
        this.logger.add(new winston.transports.File({ filename: logPath }))
    }

    public logToOutputChannel(outputChannel: vscode.OutputChannel): void {
        this.logger.add(
            new OutputChannelTransport({
                outputChannel
            })
        )
    }

    public logToConsole(): void {
        this.logger.add(new ConsoleLogTransport({}))
    }

    public debug(...message: Loggable[]): void {
        this.writeToLogs(message, 'debug')
    }

    public verbose(...message: Loggable[]): void {
        this.writeToLogs(message, 'verbose')
    }

    public info(...message: Loggable[]): void {
        this.writeToLogs(message, 'info')
    }

    public warn(...message: Loggable[]): void {
        this.writeToLogs(message, 'warn')
    }

    public error(...message: Loggable[]): void {
        this.writeToLogs(message, 'error')
    }

    public dispose() {
        if (!this.disposed) {
            this.logger.close()
            this.logger.clear()
            this.disposed = true
        }
    }

    private writeToLogs(message: Loggable[], level: LogLevel): void {
        if (this.disposed) {
            throw new Error('Cannot write to disposed logger')
        }

        const formattedMessage = formatMessage(level, message)
        this.logger.log(level, formattedMessage)
    }
}
