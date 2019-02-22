/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import * as path from 'path'
import { MESSAGE } from 'triple-beam'
import * as vscode from 'vscode'
import * as nls from 'vscode-nls'
import * as winston from 'winston'
import * as Transport from 'winston-transport'
import { SettingsConfiguration } from './settingsConfiguration'

// TODO: Add ability to handle arbitrary values, through meta parameter or LogEntry parameter
const localize = nls.loadMessageBundle()

const logFormat = winston.format.printf(({ level, message, timestamp }) => {
    return `${timestamp} [${level.toUpperCase()}]: ${message}`
})

const errFormat = winston.format( info => {
    if (info.meta && info.meta instanceof Error) {
        info.message = `${info.message} ${info.meta.stack}`
    }

    return info
})

let logSettings: LogSettings

class VscOutputChannelTransport extends Transport {
    private readonly _outputChannel: vscode.OutputChannel

    public constructor(opts: any) {
        super(opts)
        if (opts.outputChannel) {
            this._outputChannel = opts.outputChannel
        } else {
            throw new Error('No output channel present')
        }
    }

    public log(info: any, callback: () => void) {
        setImmediate(() => {
          this.emit('logged', info)
        })

        this._outputChannel.appendLine(info[MESSAGE])

        callback()
    }
}

class LogSettings {
    private static readonly LOG_LEVEL_DEFAULT: string = 'info'

    private readonly _outputChannel: vscode.OutputChannel
    private readonly _logger: winston.Logger
    private readonly _logPath: string

    public constructor(outputChannel: vscode.OutputChannel, logPath: string, configuration: SettingsConfiguration) {
        this._outputChannel = outputChannel
        this._logger = winston.createLogger({
            format: winston.format.combine(
                winston.format.splat(),
                winston.format.timestamp(),
                errFormat(),
                logFormat
            ),
            transports: [
                new winston.transports.File({ filename: logPath }),
                new VscOutputChannelTransport({ outputChannel: outputChannel })
            ]
        })
        this._logPath = logPath
        const settingsLogLevel = configuration.readSetting<string>('logLevel')
        if (settingsLogLevel) {
            this.level = settingsLogLevel
        } else {
            this.level = LogSettings.LOG_LEVEL_DEFAULT
        }
    }

    public get outputChannel(): vscode.OutputChannel {
        return this._outputChannel
    }

    public get logger(): winston.Logger {
        return this._logger
    }

    public set level(level: string) {
        if (level && this._logger.levels.hasOwnProperty(level)) {
            this._logger.level = level
        } else {
            this._logger.warn(localize(
                'AWS.log.invalidLevel',
                'Invalid log level: {0}',
                level
            ))
        }
    }

    public get level(): string {
        return this._logger.level
    }

    public get logPath(): string {
        return this._logPath
    }
}

export async function initialize(context: vscode.ExtensionContext, configuration: SettingsConfiguration):
    Promise<void> {

    const outputChannel: vscode.OutputChannel = vscode.window.createOutputChannel('AWS Toolkit Logs')
    const logPath = context.logPath + '.log'
    logSettings = new LogSettings(outputChannel, logPath, configuration)

    logSettings.outputChannel.appendLine(localize(
        'AWS.log.fileLocation',
        'Error logs for this session can be found in {0}',
        logPath
    ))
    vscode.commands.registerCommand(
        'aws.viewLogs',
        async () => await openLogFile()
    )
}

export function getLogger(): winston.Logger {
    return logSettings.logger
}

export function changeLogLevel(level: string): void {
    logSettings.level = level
}

async function openLogFile(): Promise<void> {
    await vscode.window.showTextDocument(vscode.Uri.file(path.normalize(logSettings.logPath)))
}
