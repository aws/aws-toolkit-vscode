/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import * as winston from 'winston'
import * as Transport from 'winston-transport'
import { extensionSettingsPrefix } from './constants'
import { mkdir } from './filesystem'
import { fileExists } from './filesystemUtilities'
import { DefaultSettingsConfiguration, SettingsConfiguration } from './settingsConfiguration'
import { registerCommand } from './telemetry/telemetryUtils'

const localize = nls.loadMessageBundle()

const LOG_RELATIVE_PATH: string = path.join('Code', 'logs', 'aws_toolkit')
const DEFAULT_LOG_LEVEL: LogLevel = 'info'
const DEFAULT_LOG_NAME: string = `aws_toolkit_${makeDateString('filename')}.log`
const DEFAULT_OUTPUT_CHANNEL: vscode.OutputChannel = vscode.window.createOutputChannel('AWS Toolkit Logs')

let defaultLogger: Logger

interface LogEntry {
    level: string
    message: string
}

export class OutputChannelTransport extends Transport {
    private readonly outputChannel: vscode.OutputChannel

    public constructor(
        options: Transport.TransportStreamOptions & {
            outputChannel: vscode.OutputChannel
        }
    ) {
        super(options)

        this.outputChannel = options.outputChannel
    }

    public log(info: LogEntry, next: () => void): void {
        setImmediate(() => {
            this.outputChannel.appendLine(info.message)
        })

        next()
    }
}

export interface BasicLogger {
    debug(...message: ErrorOrString[]): void
    verbose(...message: ErrorOrString[]): void
    info(...message: ErrorOrString[]): void
    warn(...message: ErrorOrString[]): void
    error(...message: ErrorOrString[]): void
}

export type LogLevel = keyof BasicLogger

export interface Logger extends BasicLogger {
    level: LogLevel
}

// TODO : CC : Phase out Logger retain only BasicLogger
export class WinstonToolkitLogger implements Logger, vscode.Disposable {
    // forces winston to output only pre-formatted message
    private static readonly LOG_FORMAT = winston.format.printf(({ message }) => {
        return message
    })

    public readonly level: LogLevel

    private readonly logger: winston.Logger
    private disposed: boolean = false

    public constructor(logLevel: LogLevel) {
        this.logger = winston.createLogger({
            format: winston.format.combine(WinstonToolkitLogger.LOG_FORMAT),
            level: logLevel
        })

        this.level = logLevel
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

    public debug(...message: ErrorOrString[]): void {
        this.writeToLogs(message, 'debug')
    }

    public verbose(...message: ErrorOrString[]): void {
        this.writeToLogs(message, 'verbose')
    }

    public info(...message: ErrorOrString[]): void {
        this.writeToLogs(message, 'info')
    }

    public warn(...message: ErrorOrString[]): void {
        this.writeToLogs(message, 'warn')
    }

    public error(...message: ErrorOrString[]): void {
        this.writeToLogs(message, 'error')
    }

    public dispose() {
        if (!this.disposed) {
            // todo : CC : onWillDispose hook?
            this.logger.close()
            this.logger.clear()
            this.disposed = true
        }
    }

    private writeToLogs(message: ErrorOrString[], level: LogLevel): void {
        if (this.disposed) {
            throw new Error('Cannot write to disposed logger')
        }

        const formattedMessage = formatMessage(level, message)
        this.logger.log(level, formattedMessage)
    }
}

/**
 * logPath is not required (as Winston will work without a file path defined) but will output errors to stderr.
 */
export interface LoggerParams {
    outputChannel?: vscode.OutputChannel
    logPath?: string
    logLevel?: LogLevel
}

/**
 * @param params: LoggerParams
 * Creates the "default logger" (returnable here and through getLogger) using specified parameters or default values.
 * Initializing again will create a new default logger
 * --however, existing logger objects using the old default logger will be unaffected.
 */
export async function initialize(params?: LoggerParams): Promise<Logger> {
    let outputChannel: vscode.OutputChannel | undefined
    let logPath: string | undefined

    if (!params) {
        outputChannel = DEFAULT_OUTPUT_CHANNEL
        logPath = getDefaultLogPath()

        const logFolder = path.dirname(logPath)
        if (!(await fileExists(logFolder))) {
            await mkdir(logFolder, { recursive: true })
        }

        // TODO : CC : Determine log level here, then createLogger calls in this method can converge
        const newLogger = createLogger({
            outputChannel,
            logPath
        })

        initializeDefaultLogger(newLogger)

        // only the default logger (with default params) gets a registered command
        // check list of registered commands to see if aws.viewLogs has already been registered.
        // if so, don't register again--this will cause an error visible to the user.
        for (const command of await vscode.commands.getCommands(true)) {
            if (command === 'aws.viewLogs') {
                return defaultLogger
            }
        }
        registerCommand({
            command: 'aws.viewLogs',
            callback: async () => await vscode.window.showTextDocument(vscode.Uri.file(path.normalize(logPath!)))
        })
    } else {
        outputChannel = params.outputChannel
        logPath = params.logPath

        // TODO : CC :This isn't necessary if we use a MemoryLogger
        initializeDefaultLogger(createLogger(params))
    }

    if (outputChannel && logPath) {
        outputChannel.appendLine(
            localize('AWS.log.fileLocation', 'Error logs for this session are permanently stored in {0}', logPath)
        )
    }

    return defaultLogger
}

export function initializeDefaultLogger(logger: Logger) {
    defaultLogger = logger
}

/**
 * Gets the default logger if it has been initialized with the initialize() function
 */
export function getLogger(): Logger {
    if (defaultLogger) {
        return defaultLogger
    }
    throw new Error('Default Logger not initialized. Call logger.initialize() first.')
}

/**
 * @param params: LoggerParams--nothing is required, but a LogPath is highly recommended so Winston doesn't throw errors
 *
 * Outputs a logger object that isn't stored anywhere--it's up to the caller to keep track of this.
 */
export function createLogger(params: LoggerParams): Logger {
    // TODO : CC : Determine log level in this method's caller
    let level: LogLevel
    if (params.logLevel) {
        level = params.logLevel
    } else {
        const configuration: SettingsConfiguration = new DefaultSettingsConfiguration(extensionSettingsPrefix)
        const setLevel = configuration.readSetting<string>('logLevel')
        level = setLevel ? (setLevel as LogLevel) : DEFAULT_LOG_LEVEL
    }
    // const transports: Transport[] = []
    // if (params.logPath) {
    //     transports.push(new winston.transports.File({ filename: params.logPath }))
    // }

    // transports.push(
    //     new OutputChannelTransport({
    //         level
    //     })
    // )

    // const newLogger: winston.Logger = winston.createLogger({
    //     format: winston.format.combine(logFormat),
    //     level
    //     //        transports
    // })

    const newLogger = new WinstonToolkitLogger(level)
    if (params.logPath) {
        newLogger.logToFile(params.logPath)
    }

    if (params.outputChannel) {
        newLogger.logToOutputChannel(params.outputChannel)
    }

    // const fl = new winston.transports.File({ filename: params.logPath })
    // newLogger.add(fl)
    // newLogger.add(new OutputChannelTransport({ level }))
    // newLogger.remove(fl)
    // newLogger.remove(fl)

    return newLogger

    // return {
    //     logPath: params.logPath,
    //     level,
    //     // outputChannel: params.outputChannel,
    //     debug: (...message: ErrorOrString[]) =>
    //         writeToLogs(generateWriteParams(newLogger, 'debug', message, params.outputChannel)),
    //     verbose: (...message: ErrorOrString[]) =>
    //         writeToLogs(generateWriteParams(newLogger, 'verbose', message, params.outputChannel)),
    //     info: (...message: ErrorOrString[]) =>
    //         writeToLogs(generateWriteParams(newLogger, 'info', message, params.outputChannel)),
    //     warn: (...message: ErrorOrString[]) =>
    //         writeToLogs(generateWriteParams(newLogger, 'warn', message, params.outputChannel)),
    //     error: (...message: ErrorOrString[]) =>
    //         writeToLogs(generateWriteParams(newLogger, 'error', message, params.outputChannel)),
    //     releaseLogger: () => releaseLogger(newLogger)
    // }
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

// async function openLogFile(): Promise<void> {
//     if (defaultLogger.logPath) {
//         await vscode.window.showTextDocument(vscode.Uri.file(path.normalize(defaultLogger.logPath)))
//     }
// }

// function releaseLogger(logger: winston.Logger): void {
//     logger.clear()
// }

function formatMessage(level: LogLevel, message: ErrorOrString[]): string {
    // TODO : Look into winston custom formats - https://github.com/winstonjs/winston#creating-custom-formats
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

// function writeToLogs(params: WriteToLogParams): void {
//     const message = formatMessage(params.level, params.message)
//     params.logger.log(params.level, message)
//     // if (params.outputChannel) {
//     //     writeToOutputChannel(
//     //         params.logger.levels[params.level],
//     //         params.logger.levels[params.logger.level],
//     //         message,
//     //         params.outputChannel
//     //     )
//     // }
// }

// function writeToOutputChannel(
//     messageLevel: number,
//     logLevel: number,
//     message: string,
//     outputChannel: vscode.OutputChannel
// ): void {
//     // using default Winston log levels (mapped to numbers): https://github.com/winstonjs/winston#logging
//     if (messageLevel <= logLevel) {
//         outputChannel.appendLine(message)
//     }
// }

// outputs a timestamp with the following formattings:
// type: 'filename' = YYYYMMDDThhmmss (note the 'T' prior to time, matches VS Code's log file name format)
// type: 'logFile' = YYYY-MM-DD HH:MM:SS
// Uses local timezone
function makeDateString(type: 'filename' | 'logfile'): string {
    const d = new Date()
    const isFilename: boolean = type === 'filename'

    return (
        `${d.getFullYear()}${isFilename ? '' : '-'}` +
        // String.prototype.padStart() was introduced in ES7, but we target ES6.
        `${padNumber(d.getMonth() + 1)}${isFilename ? '' : '-'}` +
        `${padNumber(d.getDate())}${isFilename ? 'T' : ' '}` +
        `${padNumber(d.getHours())}${isFilename ? '' : ':'}` +
        `${padNumber(d.getMinutes())}${isFilename ? '' : ':'}` +
        `${padNumber(d.getSeconds())}`
    )
}

function padNumber(num: number): string {
    return num < 10 ? '0' + num.toString() : num.toString()
}

// function generateWriteParams(
//     logger: winston.Logger,
//     level: LogLevel,
//     message: ErrorOrString[],
//     outputChannel?: vscode.OutputChannel
// ): WriteToLogParams {
//     return { logger: logger, level: level, message: message, outputChannel: outputChannel }
// }

// interface WriteToLogParams {
//     logger: winston.Logger
//     level: LogLevel
//     message: ErrorOrString[]
//     outputChannel?: vscode.OutputChannel
// }

export type ErrorOrString = Error | string // TODO: Consider renaming to Loggable & including number

// // forces winston to output only pre-formatted message
// const logFormat = winston.format.printf(({ message }) => {
//     return message
// })
