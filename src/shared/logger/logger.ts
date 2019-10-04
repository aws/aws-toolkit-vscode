/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as moment from 'moment'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { extensionSettingsPrefix } from '../constants'
import { mkdir } from '../filesystem'
import { fileExists } from '../filesystemUtilities'
import { DefaultSettingsConfiguration, SettingsConfiguration } from '../settingsConfiguration'
import { registerCommand } from '../telemetry/telemetryUtils'
import { Loggable } from './loggableType'
import { WinstonToolkitLogger } from './winstonToolkitLogger'

const localize = nls.loadMessageBundle()

const LOG_RELATIVE_PATH: string = path.join('Code', 'logs', 'aws_toolkit')
const DEFAULT_LOG_LEVEL: LogLevel = 'info'
const DEFAULT_LOG_NAME: string = makeDefaultLogName()
const DEFAULT_OUTPUT_CHANNEL: vscode.OutputChannel = vscode.window.createOutputChannel('AWS Toolkit Logs')

function makeDefaultLogName(): string {
    const m = moment()
    const date = m.format('YYYYMMDD')
    const time = m.format('HHmmss')
    // the 'T' matches VS Code's log file name format
    const datetime = `${date}T${time}`

    return `aws_toolkit_${datetime}.log`
}

let defaultLogger: Logger

export interface Logger {
    debug(...message: Loggable[]): void
    verbose(...message: Loggable[]): void
    info(...message: Loggable[]): void
    warn(...message: Loggable[]): void
    error(...message: Loggable[]): void
}

export type LogLevel = keyof Logger

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

        // TODO : Determine log level here, then createLogger calls in this method can converge
        defaultLogger = createLogger({
            outputChannel,
            logPath
        })
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

        defaultLogger = createLogger(params)
    }

    if (outputChannel && logPath) {
        outputChannel.appendLine(
            localize('AWS.log.fileLocation', 'Error logs for this session are permanently stored in {0}', logPath)
        )
    }

    return defaultLogger
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
    // TODO : log level should be a concern of the caller
    let level: LogLevel
    if (params.logLevel) {
        level = params.logLevel
    } else {
        const configuration: SettingsConfiguration = new DefaultSettingsConfiguration(extensionSettingsPrefix)
        const setLevel = configuration.readSetting<string>('logLevel')
        level = setLevel ? (setLevel as LogLevel) : DEFAULT_LOG_LEVEL
    }

    const logger = new WinstonToolkitLogger(level)
    if (params.logPath) {
        logger.logToFile(params.logPath)
    }

    if (params.outputChannel) {
        logger.logToOutputChannel(params.outputChannel)
    }

    return logger
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
