/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Logger, LogLevel, getLogger } from '.'
import { setLogger } from './logger'
import { WinstonToolkitLogger } from './winstonToolkitLogger'
import { Settings } from '../settings'
import { Logging } from './commands'
import { resolvePath } from '../utilities/pathUtils'
import { fsCommon } from '../../srcShared/fs'
import { isWeb } from '../extensionGlobals'

export const defaultLogLevel: LogLevel = 'debug'

/**
 * Activate Logger functionality for the extension.
 */
export async function activate(
    extensionContext: vscode.ExtensionContext,
    contextPrefix: string,
    outputChannel: vscode.LogOutputChannel,
    logChannel: vscode.LogOutputChannel
): Promise<void> {
    const settings = Settings.instance.getSection('aws')
    const devLogfile = settings.get('dev.logfile', '')
    const logUri = devLogfile ? vscode.Uri.file(resolvePath(devLogfile)) : undefined

    await fsCommon.mkdir(extensionContext.logUri)

    const mainLogger = makeLogger(
        {
            logPaths: logUri ? [logUri] : undefined,
            outputChannels: [logChannel],
            useConsoleLog: isWeb(),
        },
        extensionContext.subscriptions
    )

    setLogger(mainLogger)
    getLogger().info(`log level: ${getLogLevel()}`)

    // Logs to "AWS Toolkit" output channel.
    setLogger(
        makeLogger(
            {
                logPaths: logUri ? [logUri] : undefined,
                outputChannels: [outputChannel, logChannel],
            },
            extensionContext.subscriptions
        ),
        'channel'
    )

    // Logs to vscode Debug Console.
    setLogger(
        makeLogger(
            {
                staticLogLevel: 'debug',
                outputChannels: [outputChannel, logChannel],
                useDebugConsole: true,
            },
            extensionContext.subscriptions
        ),
        'debugConsole'
    )

    getLogger().debug(`Logging started: ${logUri}`)

    Logging.init(logUri, mainLogger, contextPrefix)
    extensionContext.subscriptions.push(Logging.instance.viewLogs, Logging.instance.viewLogsAtMessage)
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
