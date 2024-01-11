/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import { Logger, LogLevel, getLogger } from '.'
import { setLogger } from './logger'
import { logOutputChannel } from './outputChannel'
import { WinstonToolkitLogger } from './winstonToolkitLogger'
import { waitUntil } from '../utilities/timeoutUtils'
import { cleanLogFiles } from './util'
import { Settings } from '../settings'
import { Logging } from './commands'
import { resolvePath } from '../utilities/pathUtils'
import { isInBrowser } from '../../common/browserUtils'
import { fsCommon } from '../../srcShared/fs'

const localize = nls.loadMessageBundle()

const defaultLogLevel: LogLevel = 'info'

/**
 * Activate Logger functionality for the extension.
 */
export async function activate(
    extensionContext: vscode.ExtensionContext,
    outputChannel: vscode.OutputChannel
): Promise<void> {
    const chan = logOutputChannel
    const settings = Settings.instance.getSection('aws')
    const devLogfile = settings.get('dev.logfile', '')
    const logUri = devLogfile
        ? vscode.Uri.file(resolvePath(devLogfile))
        : vscode.Uri.joinPath(extensionContext.logUri, makeLogFilename())

    await fsCommon.mkdir(extensionContext.logUri)

    const mainLogger = makeLogger(
        {
            logPaths: [logUri],
            outputChannels: [chan],
            useConsoleLog: isInBrowser(),
        },
        extensionContext.subscriptions
    )

    setLogger(mainLogger)
    getLogger().info(`log level: ${getLogLevel()}`)

    // channel logger
    setLogger(
        makeLogger(
            {
                logPaths: [logUri],
                outputChannels: [outputChannel, chan],
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
                outputChannels: [outputChannel, chan],
                useDebugConsole: true,
            },
            extensionContext.subscriptions
        ),
        'debugConsole'
    )

    getLogger().debug(`Logging started: ${logUri}`)

    const commands = new Logging(logUri, mainLogger)
    extensionContext.subscriptions.push(...Object.values(Logging.declared).map(c => c.register(commands)))

    createLogWatcher(logUri)
        .then(sub => {
            extensionContext.subscriptions.push(sub)
        })
        .catch(err => {
            getLogger().warn('Failed to start log file watcher: %s', err)
        })

    cleanLogFiles(path.dirname(logUri.fsPath)).catch(err => {
        getLogger().warn('Failed to clean-up old logs: %s', err)
    })
}

/**
 * Creates a logger off of specified params
 * @param opts Specified parameters, all optional:
 * @param opts.staticLogLevel Static log level, overriding config value. Will persist overridden config value even if the config value changes.
 * @param opts.logPaths Array of paths to output log entries to
 * @param opts.outputChannels Array of output channels to log entries to
 * @param opts.useDebugConsole If true, outputs log entries to `vscode.debug.activeDebugConsole`
 * @param opts.useConsoleLog If true, outputs log entries to the nodejs or browser devtools console.
 * @param disposables Array of disposables to add a subscription to
 */
export function makeLogger(
    opts: {
        staticLogLevel?: LogLevel
        logPaths?: vscode.Uri[]
        outputChannels?: vscode.OutputChannel[]
        useDebugConsole?: boolean
        useConsoleLog?: boolean
    },
    disposables?: vscode.Disposable[]
): Logger {
    const logger = new WinstonToolkitLogger(opts.staticLogLevel ?? getLogLevel())
    // debug console can show ANSI colors, output channels can not
    const stripAnsi = opts.useDebugConsole ?? false
    for (const logPath of opts.logPaths ?? []) {
        logger.logToFile(logPath)
    }
    for (const outputChannel of opts.outputChannels ?? []) {
        logger.logToOutputChannel(outputChannel, stripAnsi)
    }
    if (opts.useDebugConsole) {
        logger.logToDebugConsole()
    }
    if (opts.useConsoleLog) {
        logger.logToConsole()
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
    const configuration = Settings.instance.getSection('aws')
    return configuration.get('logLevel', defaultLogLevel)
}

/**
 * Creates a name for the toolkit's logfile.
 * Essentially an ISO string, but in the local timezone and without the trailing "Z"
 * @returns Log filename
 */
function makeLogFilename(): string {
    const now = new Date()
    // local to machine: use getMonth/Date instead of UTC equivalent
    // month is zero-terminated: offset by 1
    const m = (now.getMonth() + 1).toString().padStart(2, '0')
    const d = now.getDate().toString().padStart(2, '0')
    const h = now.getHours().toString().padStart(2, '0')
    const mn = now.getMinutes().toString().padStart(2, '0')
    const s = now.getSeconds().toString().padStart(2, '0')
    const dt = `${now.getFullYear()}${m}${d}T${h}${mn}${s}`

    return `aws_toolkit_${dt}.log`
}

/**
 * Watches for renames on the log file and notifies the user.
 */
async function createLogWatcher(logFile: vscode.Uri): Promise<vscode.Disposable> {
    if (isInBrowser()) {
        getLogger().debug(`Not watching log file since we are in Browser.`)
        return { dispose: () => {} }
    }

    const exists = await waitUntil(() => fsCommon.existsFile(logFile), { interval: 1000, timeout: 60000 })

    if (!exists) {
        getLogger().warn(`Log file ${logFile.path} does not exist!`)
        return { dispose: () => {} }
    }

    let checking = false
    // TODO: fs.watch() has many problems, consider instead:
    //   - https://github.com/paulmillr/chokidar
    //   - https://www.npmjs.com/package/fb-watchman
    const fs = await import('fs')
    const watcher = fs.watch(logFile.fsPath, async eventType => {
        if (checking || eventType !== 'rename') {
            return
        }
        checking = true
        if (!(await fsCommon.existsFile(logFile))) {
            await vscode.window.showWarningMessage(
                localize('AWS.log.logFileMove', 'The log file for this session has been moved or deleted.')
            )
            watcher.close()
        }
        checking = false
    })

    return { dispose: () => watcher.close() }
}
