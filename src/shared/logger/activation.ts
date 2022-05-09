/*!
 * Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as moment from 'moment'
import * as path from 'path'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import * as fs from 'fs-extra'
import { Logger, LogLevel, getLogger } from '.'
import { extensionSettingsPrefix } from '../constants'
import { setLogger } from './logger'
import { LOG_OUTPUT_CHANNEL } from './outputChannel'
import { WinstonToolkitLogger } from './winstonToolkitLogger'
import { waitUntil } from '../utilities/timeoutUtils'
import { cleanLogFiles } from './util'
import { Settings } from '../settings'
import { Logging } from './commands'
import { SystemUtilities } from '../systemUtilities'

const localize = nls.loadMessageBundle()

const DEFAULT_LOG_LEVEL: LogLevel = 'info'

/**
 * Activate Logger functionality for the extension.
 */
export async function activate(
    extensionContext: vscode.ExtensionContext,
    outputChannel: vscode.OutputChannel
): Promise<void> {
    const logOutputChannel = LOG_OUTPUT_CHANNEL
    const logUri = vscode.Uri.joinPath(extensionContext.logUri, makeLogFilename())

    await SystemUtilities.createDirectory(extensionContext.logUri)

    const mainLogger = makeLogger(
        {
            logPaths: [logUri.fsPath],
            outputChannels: [logOutputChannel],
        },
        extensionContext.subscriptions
    )

    setLogger(mainLogger)
    getLogger().error(`log level: ${getLogLevel()}`)

    // channel logger
    setLogger(
        makeLogger(
            {
                logPaths: [logUri.fsPath],
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

    getLogger().debug(`Logging started: ${logUri}`)

    const commands = new Logging(logUri, mainLogger)
    extensionContext.subscriptions.push(
        ...Object.values(Logging.declared).map(c => c.register(commands)),
        await createLogWatcher(logUri.fsPath)
    )

    cleanLogFiles(path.dirname(logUri.fsPath)).catch(err => {
        getLogger().warn('Failed to clean-up old logs: %s', (err as Error).message)
    })
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
    const configuration = Settings.instance.getSection(extensionSettingsPrefix)

    return configuration.get('logLevel', DEFAULT_LOG_LEVEL)
}

function makeLogFilename(): string {
    const m = moment()
    const date = m.format('YYYYMMDD')
    const time = m.format('HHmmss')
    // the 'T' matches VS Code's log file name format
    const datetime = `${date}T${time}`

    return `aws_toolkit_${datetime}.log`
}

/**
 * Watches for renames on the log file and notifies the user.
 */
async function createLogWatcher(logPath: string): Promise<vscode.Disposable> {
    const exists = await waitUntil(() => fs.pathExists(logPath), { interval: 1000, timeout: 60000 })

    if (!exists) {
        getLogger().warn(`Log file ${logPath} does not exist!`)
        return { dispose: () => {} }
    }

    let checking = false
    // TODO: fs.watch() has many problems, consider instead:
    //   - https://github.com/paulmillr/chokidar
    //   - https://www.npmjs.com/package/fb-watchman
    const watcher = fs.watch(logPath, async eventType => {
        if (checking || eventType !== 'rename') {
            return
        }
        checking = true
        const exists = await fs.pathExists(logPath).catch(() => true)
        if (!exists) {
            vscode.window.showWarningMessage(
                localize('AWS.log.logFileMove', 'The log file for this session has been moved or deleted.')
            )
            watcher.close()
        }
        checking = false
    })

    return { dispose: () => watcher.close() }
}
