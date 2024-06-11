/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Logger, LogLevel, getLogger } from '.'
import { fromVscodeLogLevel, setLogger } from './logger'
import { WinstonToolkitLogger } from './winstonToolkitLogger'
import { Settings } from '../settings'
import { Logging } from './commands'
import { resolvePath } from '../utilities/pathUtils'
import { fsCommon } from '../../srcShared/fs'
import { isWeb } from '../extensionGlobals'

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
    const chanLogLevel = fromVscodeLogLevel(logChannel.logLevel)

    await fsCommon.mkdir(extensionContext.logUri)

    const mainLogger = makeLogger({
        logLevel: chanLogLevel,
        logPaths: logUri ? [logUri] : undefined,
        outputChannels: [logChannel],
        useConsoleLog: isWeb(),
    })
    logChannel.onDidChangeLogLevel?.(logLevel => {
        const newLogLevel = fromVscodeLogLevel(logLevel)
        mainLogger.setLogLevel(newLogLevel) // Also logs a message.
    })

    setLogger(mainLogger)
    getLogger().info(`Log level: ${chanLogLevel}`)

    // Logs to "AWS Toolkit" output channel.
    setLogger(
        makeLogger({
            logLevel: chanLogLevel,
            logPaths: logUri ? [logUri] : undefined,
            outputChannels: [outputChannel, logChannel],
        }),
        'channel'
    )

    // Logs to vscode Debug Console.
    setLogger(
        makeLogger({
            logLevel: chanLogLevel,
            outputChannels: [outputChannel, logChannel],
            useDebugConsole: true,
        }),
        'debugConsole'
    )

    getLogger().debug(`Logging started: ${logUri ?? '(no file)'}`)

    Logging.init(logUri, mainLogger, contextPrefix)
    extensionContext.subscriptions.push(Logging.instance.viewLogs, Logging.instance.viewLogsAtMessage)
}

/**
 * Creates a logger off of specified params
 * @param opts.logLevel Log messages at or above this level
 * @param opts.logPaths Array of paths to output log entries to
 * @param opts.outputChannels Array of output channels to log entries to
 * @param opts.useDebugConsole If true, outputs log entries to `vscode.debug.activeDebugConsole`
 * @param opts.useConsoleLog If true, outputs log entries to the nodejs or browser devtools console.
 */
export function makeLogger(opts: {
    logLevel: LogLevel
    logPaths?: vscode.Uri[]
    outputChannels?: vscode.OutputChannel[]
    useDebugConsole?: boolean
    useConsoleLog?: boolean
}): Logger {
    const logger = new WinstonToolkitLogger(opts.logLevel)
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

    return logger
}
