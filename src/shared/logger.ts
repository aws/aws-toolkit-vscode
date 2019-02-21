/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as path from 'path'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import * as winston from 'winston'

const localize = nls.loadMessageBundle()
let logSettings: LogSettings

class LogSettings {
    private readonly outputChannel: vscode.OutputChannel
    private readonly logger: winston.Logger
    private readonly logPath: string

    public constructor(outputChannel: vscode.OutputChannel, logPath: string, level: string = 'info') {
        this.outputChannel = outputChannel
        this.logger = winston.createLogger({
            transports: [new winston.transports.File({ filename: logPath })]
        })
        this.logPath = logPath
        // TODO: check if a default log level already exists--we can add a field for this to the settings page.
        this.setLevel(level)
    }

    public getOutputChannel(): vscode.OutputChannel {
        return this.outputChannel
    }

    public getLogger(): winston.Logger {
        return this.logger
    }

    public setLevel(level: string): void {
        if (this.logger.levels.hasOwnProperty(level)) {
            this.logger.level = level
        } else {
            warn(localize(
                'AWS.log.invalidLevel',
                'Invalid log level: {0}',
                level
            ))
        }
    }

    public getLevel(): string {
        return this.logger.level
    }

    public getLogPath(): string {
        return this.logPath
    }
}

export function initialize(context: vscode.ExtensionContext): void {
    const outputChannel: vscode.OutputChannel = vscode.window.createOutputChannel('AWS Toolkit Logs')
    const logPath = context.logPath + '.log'
    logSettings = new LogSettings(outputChannel, logPath)

    logSettings.getOutputChannel().appendLine(localize(
        'AWS.log.fileLocation',
        'Error logs for this session can be found in {0}',
        logPath
    ))
    vscode.commands.registerCommand(
        'aws.viewLogs',
        async () => await openLogFile()
    )
}

// TODO: Format correctly/uniformly
// TODO: Add timestamps
// TODO: Add ability to handle arbitrary values, through meta parameter or LogEntry parameter
export function log(level: string, message: string): void {
    logSettings.getLogger().log(level, message)
    logSettings.getOutputChannel().appendLine(`[${level}]: ${message}`)
}

export function info(message: string): void {
    log('info', message)
}

export function warn(message: string): void {
    log('warn', message)
}

export function error(message: string): void {
    log('error', message)
}

export function changeLogLevel(level: string): void {
    logSettings.setLevel(level)
}

async function openLogFile(): Promise<void> {
    await vscode.window.showTextDocument(vscode.Uri.file(path.normalize(logSettings.getLogPath())))
}
