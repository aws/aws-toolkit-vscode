/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as moment from 'moment'
import * as path from 'path'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import * as fs from 'fs-extra'
import * as _ from 'lodash'
import { Logger, LogLevel, getLogger } from '.'
import { extensionSettingsPrefix } from '../constants'
import { DefaultSettingsConfiguration, SettingsConfiguration } from '../settingsConfiguration'
import { recordVscodeViewLogs } from '../telemetry/telemetry'
import { setLogger } from './logger'
import { LOG_OUTPUT_CHANNEL } from './outputChannel'
import { WinstonToolkitLogger } from './winstonToolkitLogger'
import { ext } from '../extensionGlobals'

const localize = nls.loadMessageBundle()

const DEFAULT_LOG_LEVEL: LogLevel = 'info'

const LOG_MAX_BYTES = 100000000 // 100 MB
const MAX_LOG_FILES = 100
const MAX_KEPT_LOG_FILES = 10
const MIN_KEPT_LOG_FILES = 2

/** One log per session */
let logPath: string

/**
 * Activate Logger functionality for the extension.
 */
export async function activate(
    extensionContext: vscode.ExtensionContext,
    outputChannel: vscode.OutputChannel
): Promise<void> {
    const logOutputChannel = LOG_OUTPUT_CHANNEL
    logPath = getLogPath()

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
    logOutputChannel.appendLine(localize('AWS.log.fileLocation', 'Log file: {0}', logPath))

    cleanLogFiles(logPath, LOG_MAX_BYTES)
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
        logger.logToFile(logPath)
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

function getLogPath(): string {
    if (logPath !== undefined) {
        return logPath
    }

    // TODO: 'globalStoragePath' is deprecated in later versions of VS Code, use 'globalStorageUri' when min >= 1.48
    const logsDir = path.join(ext.context.globalStoragePath, 'logs')

    return path.join(logsDir, makeLogFilename())
}

function getLogUri(): vscode.Uri {
    return vscode.Uri.file(path.normalize(getLogPath()))
}

function makeLogFilename(): string {
    const m = moment()
    const date = m.format('YYYYMMDD')
    const time = m.format('HHmmss')
    // the 'T' matches VS Code's log file name format
    const datetime = `${date}T${time}`

    return `aws_toolkit_${datetime}.log`
}

async function openLogUri(logUri: vscode.Uri): Promise<vscode.TextEditor | undefined> {
    recordVscodeViewLogs() // Perhaps add additional argument to know which log was viewed?
    return await vscode.window.showTextDocument(logUri)
}

async function registerLoggerCommands(context: vscode.ExtensionContext): Promise<void> {
    context.subscriptions.push(vscode.commands.registerCommand('aws.viewLogs', async () => openLogUri(getLogUri())))
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'aws.viewLogsAtMessage',
            async (logID: number = -1, logUri: vscode.Uri = getLogUri()) => {
                const msg: string | undefined = getLogger().getLogById(logID, logUri)
                const editor: vscode.TextEditor | undefined = await openLogUri(logUri)

                if (!msg || !editor) {
                    return
                }

                // Retrieve where the message starts by counting number of newlines
                const text: string = editor.document.getText()
                const lineStart: number = text
                    .substring(0, text.indexOf(msg))
                    .split(/\r?\n/)
                    .filter(x => x).length

                if (lineStart > 0) {
                    const lineEnd: number = lineStart + msg.split(/\r?\n/).filter(x => x).length
                    const startPos = editor.document.lineAt(lineStart).range.start
                    const endPos = editor.document.lineAt(lineEnd - 1).range.end
                    editor.selection = new vscode.Selection(startPos, endPos)
                    editor.revealRange(new vscode.Range(startPos, endPos))
                } else {
                    // No message found, clear selection
                    editor.selection = new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0))
                }
            }
        )
    )
}

/**
 * Deletes the older logs when there are too many or are using too much space.
 */
async function cleanLogFiles(logPath: string, logMaxBytes: number): Promise<void> {
    let files = await fs.readdir(logPath)

    if (files.length > MAX_LOG_FILES) {
        await deleteOldLogFiles(logPath, files, MAX_KEPT_LOG_FILES)
        files = await fs.readdir(logPath)
    }

    let dirSize = 0
    const oversizedFiles = []
    for (const log of files) {
        const logFullPath = path.join(logPath, log)
        let logSize: number = 0
        try {
            logSize = (await fs.stat(logFullPath)).size
        } catch (e) {
            getLogger().error('cleanLogFiles: fs.stat() failed on file: %0', logFullPath, e)
        }
        if (logSize > LOG_MAX_BYTES) {
            if (log === getLogPath()) {
                getLogger().warn('logs: Log file for this session has exceeded the size limit.')
            } else {
                oversizedFiles.push(log)
            }
        }
        dirSize += logSize
    }
    // remove any single files over 100MB
    if (oversizedFiles.length) {
        await deleteOldLogFiles(logPath, oversizedFiles, 0)
        files = await fs.readdir(logPath)
    }
    if (dirSize > logMaxBytes) {
        await deleteOldLogFiles(logPath, files, MIN_KEPT_LOG_FILES)
    }
}

/**
 * Deletes the oldest created files, leaving the desired quantity of latest files.
 */
async function deleteOldLogFiles(logPath: string, files: string[], keepLatest: number): Promise<void> {
    files.sort()
    // This removes the latest files, leaving only the files to be deleted
    files.length = files.length >= keepLatest ? files.length - keepLatest : 0
    if (files.length) {
        for (const file of files) {
            try {
                await fs.unlink(path.join(logPath, file))
            } catch (error) {
                getLogger().error('Failed to delete file: %0', file, error)
            }
        }
        getLogger().info(
            `Log folder contains more than 100 logs or is over 100MB. Deleted the ${files.length} oldest files`
        )
    }
}

export function watchLogFile(): fs.FSWatcher {
    return fs.watch(
        getLogPath(),
        _.debounce((eventType, filename) => {
            if (eventType === 'rename') {
                vscode.window.showWarningMessage(
                    localize('AWS.log.logFileNotFound', 'The log file for this session has been moved or deleted.')
                )
            }
        }, 100)
    )
}
