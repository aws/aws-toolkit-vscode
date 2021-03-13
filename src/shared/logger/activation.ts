/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as moment from 'moment'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import * as fs from 'fs-extra'
import { Logger, LogLevel, getLogger } from '.'
import { extensionSettingsPrefix } from '../constants'
import { DefaultSettingsConfiguration, SettingsConfiguration } from '../settingsConfiguration'
import { recordVscodeViewLogs } from '../telemetry/telemetry'
import { setLogger } from './logger'
import { LOG_OUTPUT_CHANNEL } from './outputChannel'
import { WinstonToolkitLogger } from './winstonToolkitLogger'
import { parseLogObject } from './logManager'

const localize = nls.loadMessageBundle()

const LOG_PATH = path.join(getLogBasePath(), 'Code', 'logs', 'aws_toolkit', makeLogFilename())
const DEFAULT_LOG_LEVEL: LogLevel = 'info'

/**
 * Activate Logger functionality for the extension.
 */
export async function activate(
    extensionContext: vscode.ExtensionContext,
    outputChannel: vscode.OutputChannel
): Promise<void> {
    const logOutputChannel = LOG_OUTPUT_CHANNEL
    const logPath = LOG_PATH

    await fs.ensureDir(path.dirname(logPath))

    // default logger
    setLogger(
        makeLogger(
            {
                logPaths: [logPath],
                outputChannels: [logOutputChannel],
            },
            extensionContext.subscriptions
        )
    )
    getLogger().error(`log level: ${getLogLevel()}`)

    // channel logger
    setLogger(
        makeLogger(
            {
                logPaths: [logPath],
                outputChannels: [outputChannel, logOutputChannel],
            },
            extensionContext.subscriptions
        ),
        'channel'
    )

    // debug channel logger
    setLogger(
        makeLogger(
            {
                staticLogLevel: 'verbose', // verbose will log anything
                outputChannels: [outputChannel, logOutputChannel],
                useDebugConsole: true,
            },
            extensionContext.subscriptions
        ),
        'debugConsole'
    )

    await registerLoggerCommands(extensionContext)
    logOutputChannel.appendLine(
        localize('AWS.log.fileLocation', 'Error logs for this session are permanently stored in {0}', logPath)
    )
}

/**
 * Creates a logger off of specified params
 * @param opts Specified parameters, all optional:
 * @param opts.staticLogLevel Static log level, overriding config value. Will persist overridden config value even if the config value changes.
 * @param opts.logPaths Array of paths to output log entries to
 * @param opts.outputChannels Array of output channels to log entries to
 * @param opts.useDebugConsole If true, outputs log entries to currently-active debug console. As per VS Code API, cannot specify a debug console in particular.
 * @param disposables Array of disposables to add a subscription to
 */
export function makeLogger(
    opts: {
        staticLogLevel?: LogLevel
        logPaths?: string[]
        outputChannels?: vscode.OutputChannel[]
        useDebugConsole?: boolean
    },
    disposables?: vscode.Disposable[]
): Logger {
    const logger = new WinstonToolkitLogger(opts.staticLogLevel ?? getLogLevel())
    // debug console can show ANSI colors, output channels can not
    // if we're outputting to an output channel, any other output doesn't need ANSI color codes since we have a better display from them in the IDE
    // don't alter logfile output for now since that should be more diagnostic. On the fence about this...
    const stripAnsi = opts.useDebugConsole || false
    for (const logPath of opts.logPaths ?? []) {
        if (logPath === LOG_PATH) {
            logger.logToFile(logPath, "logged", parseLogObject)
        } else {
            logger.logToFile(logPath)
        }
    }
    for (const outputChannel of opts.outputChannels ?? []) {
        logger.logToOutputChannel(outputChannel, stripAnsi)
    }
    if (opts.useDebugConsole) {
        logger.logToDebugConsole()
    }

    if (!opts.staticLogLevel) {
        vscode.workspace.onDidChangeConfiguration(
            configurationChangeEvent => {
                if (configurationChangeEvent.affectsConfiguration('aws.logLevel')) {
                    const newLogLevel = getLogLevel()
                    logger.setLogLevel(newLogLevel)
                }
            },
            undefined,
            disposables
        )
    }

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

async function registerLoggerCommands(context: vscode.ExtensionContext): Promise<void> {
    context.subscriptions.push(
        vscode.commands.registerCommand('aws.viewLogs', async () => {
            await vscode.window.showTextDocument(vscode.Uri.file(path.normalize(LOG_PATH)))
            recordVscodeViewLogs()
        })
    )
    context.subscriptions.push(
        vscode.commands.registerCommand('aws.viewLogsAtMessage', async (msgPromise: Promise<string | undefined>) => {
            const msg: string | undefined = await msgPromise.then(m => m)
            await vscode.commands.executeCommand('aws.viewLogs')

            if (!msg) {
                return
            }

            const editor: vscode.TextEditor | undefined = vscode.window.activeTextEditor          

            if (editor) {
                const text: string = editor.document.getText()
                const lineStart: number = text.substring(0, text.indexOf(msg)).split(/\r?\n/).filter(x => x).length

                if (lineStart > 0) {
                    const lineEnd: number = lineStart + msg.split(/\r?\n/).filter(x => x).length
                    const startPos = editor.document.lineAt(lineStart).range.start
                    const endPos = editor.document.lineAt(lineEnd-1).range.end
                    editor.selection = new vscode.Selection(startPos, endPos)
                    editor.revealRange(new vscode.Range(startPos, endPos))
                } else {
                    editor.selection = new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0))
                }
            }
        })
    )
}
