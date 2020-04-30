/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as moment from 'moment'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { Logger, LogLevel, getLogger } from '.'
import { extensionSettingsPrefix } from '../constants'
import { mkdir } from '../filesystem'
import { fileExists } from '../filesystemUtilities'
import { DefaultSettingsConfiguration, SettingsConfiguration } from '../settingsConfiguration'
import { recordVscodeViewLogs } from '../telemetry/telemetry'
import { setLogger } from './logger'
import { WinstonToolkitLogger } from './winstonToolkitLogger'

const localize = nls.loadMessageBundle()

const LOG_PATH = path.join(getLogBasePath(), 'Code', 'logs', 'aws_toolkit', makeLogFilename())
const DEFAULT_LOG_LEVEL: LogLevel = 'info'
const LOG_OUTPUT_CHANNEL: vscode.OutputChannel = vscode.window.createOutputChannel('AWS Toolkit Logs')

/**
 * Activate Logger functionality for the extension.
 */
export async function activate(extensionContext: vscode.ExtensionContext): Promise<void> {
    const outputChannel = LOG_OUTPUT_CHANNEL
    const logPath = LOG_PATH
    const logLevel = getLogLevel()

    await ensureLogFolderExists(path.dirname(logPath))
    setLogger(makeLogger(logLevel, logPath, outputChannel, extensionContext.subscriptions))
    await registerLoggerCommands(extensionContext)
    getLogger().info(`log level: ${logLevel}`)
    outputChannel.appendLine(
        localize('AWS.log.fileLocation', 'Error logs for this session are permanently stored in {0}', logPath)
    )
}

export function makeLogger(
    logLevel: LogLevel,
    logPath: string,
    outputChannel: vscode.OutputChannel,
    disposables?: vscode.Disposable[]
): Logger {
    const logger = new WinstonToolkitLogger(logLevel)
    logger.logToFile(logPath)
    logger.logToOutputChannel(outputChannel)

    vscode.workspace.onDidChangeConfiguration(
        configurationChangeEvent => {
            if (configurationChangeEvent.affectsConfiguration('aws.logLevel')) {
                const newLogLevel = vscode.workspace.getConfiguration('aws').get('logLevel', logLevel)
                logger.setLogLevel(newLogLevel)
            }
        },
        undefined,
        disposables
    )

    return logger
}

function getLogLevel(): LogLevel {
    const configuration: SettingsConfiguration = new DefaultSettingsConfiguration(extensionSettingsPrefix)

    return configuration.readSetting<LogLevel>('logLevel', DEFAULT_LOG_LEVEL)
}

function getLogBasePath(): string {
    if (os.platform() === 'win32') {
        return path.join(os.homedir(), 'AppData', 'Roaming')
    } else if (os.platform() === 'darwin') {
        return path.join(os.homedir(), 'Library', 'Application Support')
    } else {
        return path.join(os.homedir(), '.config')
    }
}

function makeLogFilename(): string {
    const m = moment()
    const date = m.format('YYYYMMDD')
    const time = m.format('HHmmss')
    // the 'T' matches VS Code's log file name format
    const datetime = `${date}T${time}`

    return `aws_toolkit_${datetime}.log`
}

async function ensureLogFolderExists(logFolder: string): Promise<void> {
    if (!(await fileExists(logFolder))) {
        await mkdir(logFolder, { recursive: true })
    }
}

async function registerLoggerCommands(context: vscode.ExtensionContext): Promise<void> {
    context.subscriptions.push(
        vscode.commands.registerCommand('aws.viewLogs', async () => {
            await vscode.window.showTextDocument(vscode.Uri.file(path.normalize(LOG_PATH)))
            recordVscodeViewLogs()
        })
    )
}
