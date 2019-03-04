/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import * as winston from 'winston'
import * as Transport from 'winston-transport'
import { extensionSettingsPrefix } from './constants'
import { DefaultSettingsConfiguration, SettingsConfiguration } from './settingsConfiguration'

const localize = nls.loadMessageBundle()

const LOG_RELATIVE_PATH: string = path.join('Code', 'logs', 'aws_toolkit')
const DEFAULT_LOG_LEVEL: string = 'info'
const DEFAULT_LOG_NAME: string = `aws_toolkit_${makeDateString('filename')}.log`
const DEFAULT_OUTPUT_CHANNEL: vscode.OutputChannel = vscode.window.createOutputChannel('AWS Toolkit Logs')

let defaultLogger: Logger

export interface Logger {
    logPath?: string
    outputChannel?: vscode.OutputChannel
    level: string
    debug(...message: ErrorOrString[]): void
    verbose(...message: ErrorOrString[]): void
    info(...message: ErrorOrString[]): void
    warn(...message: ErrorOrString[]): void
    error(...message: ErrorOrString[]): void
    releaseLogger(): void
}

export interface LoggerParams {
    outputChannel?: vscode.OutputChannel
    logPath?: string
    logLevel?: string
}

// creates default logger object
// can overwrite defaultLogger if you include params
export function initialize(params?: LoggerParams): Logger {
    if (!params) {
        defaultLogger = createLogger({
            outputChannel: DEFAULT_OUTPUT_CHANNEL,
            logPath: getDefaultLogPath()
        })
        // only the default logger (with default params) gets a registered command
        vscode.commands.registerCommand(
            'aws.viewLogs',
            async () => await openLogFile()
        )
    } else {
        defaultLogger = createLogger(params)
    }
    if (defaultLogger.outputChannel) {
        defaultLogger.outputChannel.appendLine(localize(
            'AWS.log.fileLocation',
            'Error logs for this session are permanently stored in {0}',
            defaultLogger.logPath
        ))
    }

    return defaultLogger
}

// returns default logger object
export function getLogger(): Logger {
    if (defaultLogger) {
        return defaultLogger
    }
    throw new Error ('Default Logger not initialized. Call logger.initialize() first.')
}

// creates and returns custom logger
// it's the caller's responsibility to keep track of this logger object
export function createLogger(params: LoggerParams): Logger {
    let level: string
    if (params.logLevel) {
        level = params.logLevel
    } else {
        const configuration: SettingsConfiguration = new DefaultSettingsConfiguration(extensionSettingsPrefix)
        level =
            configuration.readSetting<string>('logLevel') ?
            configuration.readSetting<string>('logLevel') as string : DEFAULT_LOG_LEVEL
    }
    const transports: Transport[] = []
    if (params.logPath) {
        transports.push(new winston.transports.File({ filename: params.logPath }))
    }

    const newLogger: winston.Logger = winston.createLogger({
        format: winston.format.combine(
            logFormat
        ),
        level: level,
        transports: transports
    })

    return {
        logPath: params.logPath,
        level: level,
        outputChannel: params.outputChannel,
        debug: (...message: ErrorOrString[]) =>
            writeToLogs(generateWriteParams(newLogger, 'debug', message, params.outputChannel)),
        verbose: (...message: ErrorOrString[]) =>
            writeToLogs(generateWriteParams(newLogger, 'verbose', message, params.outputChannel)),
        info: (...message: ErrorOrString[]) =>
            writeToLogs(generateWriteParams(newLogger, 'info', message, params.outputChannel)),
        warn: (...message: ErrorOrString[]) =>
            writeToLogs(generateWriteParams(newLogger, 'warn', message, params.outputChannel)),
        error: (...message: ErrorOrString[]) =>
            writeToLogs(generateWriteParams(newLogger, 'error', message, params.outputChannel)),
        releaseLogger: () => releaseLogger(newLogger)
    }
}

function getDefaultLogPath(): string {
    if (os.platform() === 'win32') {
        return path.join(os.homedir(), 'AppData', 'Roaming', LOG_RELATIVE_PATH, DEFAULT_LOG_NAME)
    } else if (os.platform() === 'darwin') {
        return path.join(os.homedir(), 'Library', 'Application Support', LOG_RELATIVE_PATH, DEFAULT_LOG_NAME)
    } else {
        return path.join(os.homedir(), '.config', LOG_RELATIVE_PATH, DEFAULT_LOG_NAME)
    }
}

async function openLogFile(): Promise<void> {
    if (defaultLogger.logPath) {
        await vscode.window.showTextDocument(vscode.Uri.file(path.normalize(defaultLogger.logPath)))
    }
}

function releaseLogger(logger: winston.Logger): void {
    logger.clear()
}

function formatMessage(level: string, message: ErrorOrString[]): string {
    let final: string = `${makeDateString('logfile')} [${level.toUpperCase()}]:`
    for (const chunk of message) {
        if (chunk instanceof Error) {
            final = `${final} ${chunk.stack}`
        } else {
            final = `${final} ${chunk}`
        }
    }

    return final
}

function writeToLogs(params: WriteToLogParams): void {
    const message = formatMessage(params.level, params.message)
    params.logger.log(params.level, message)
    if (params.outputChannel) {
        writeToOutputChannel(params.logger.levels[params.level],
                             params.logger.levels[params.logger.level],
                             message,
                             params.outputChannel)
    }
}

function writeToOutputChannel(messageLevel: number,
                              logLevel: number,
                              message: string,
                              outputChannel: vscode.OutputChannel): void {
    // using default Winston log levels (mapped to numbers): https://github.com/winstonjs/winston#logging
    if (messageLevel <= logLevel) {
        outputChannel.appendLine(message)
    }
}

// matches VS Code's log file name format
// YYYYMMDDThhmmss (note the 'T' prior to time)
// Uses local timezone
function makeDateString(type: 'filename' | 'logfile'): string {
    const d = new Date()
    const isFilename: boolean = type === 'filename'

    return `${d.getFullYear()}${chooseSpacer(isFilename, '', '-')}` +
    // String.prototype.padStart() is not available in Typescript...
    `${padNumber(d.getMonth() + 1)}${chooseSpacer(isFilename, '', '-')}` +
    `${padNumber(d.getDate())}${chooseSpacer(isFilename, 'T', ' ')}` +
    `${padNumber(d.getHours())}${chooseSpacer(isFilename, '', ':')}` +
    `${padNumber(d.getMinutes())}${chooseSpacer(isFilename, '', ':')}` +
    `${padNumber(d.getSeconds())}`
}

function padNumber(num: number): string {
    return num < 10 ? '0' + num.toString() : num.toString()
}

function chooseSpacer(isFilename: boolean, ifTrue: string, ifFalse: string): string {
    if (isFilename) { return ifTrue }

    return ifFalse
}

function generateWriteParams(logger: winston.Logger,
                             level: string,
                             message: ErrorOrString[],
                             outputChannel?: vscode.OutputChannel ): WriteToLogParams {
    return { logger: logger, level: level, message: message, outputChannel: outputChannel }
}

interface WriteToLogParams {
    logger: winston.Logger
    level: string
    message: ErrorOrString[]
    outputChannel?: vscode.OutputChannel
}

type ErrorOrString = Error | string

// forces winston to output only preformatted message
const logFormat = winston.format.printf(({ message }) => {
    return message
})
