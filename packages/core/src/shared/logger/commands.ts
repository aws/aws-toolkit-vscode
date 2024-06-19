/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Logger } from '.'
import { telemetry } from '../telemetry/telemetry'
import { Commands } from '../vscode/commands2'
import { getLogger } from './logger'
import globals from '../extensionGlobals'

function revealLines(editor: vscode.TextEditor, start: number, end: number): void {
    const startPos = editor.document.lineAt(start).range.start
    const endPos = editor.document.lineAt(end - 1).range.end

    editor.selection = new vscode.Selection(startPos, endPos)
    editor.revealRange(new vscode.Range(startPos, endPos))
}

function clearSelection(editor: vscode.TextEditor): void {
    const start = new vscode.Position(0, 0)

    editor.selection = new vscode.Selection(start, start)
}

export class Logging {
    public readonly viewLogs
    public readonly viewLogsAtMessage

    static #instance: Logging

    public static get instance() {
        if (!this.#instance) {
            throw new Error('Logging class used without calling Logging.init().')
        }
        return this.#instance
    }

    /**
     * @param logUri (optional) Log file path, only used for "developer mode" (`aws.dev.logfile` setting).
     * @param logger
     * @param contextPrefix Decided the command name based on the extension context.
     */
    public static init(logUri: vscode.Uri | undefined, logger: Logger, contextPrefix: string) {
        this.#instance = new Logging(logUri, logger, contextPrefix)
    }

    /**
     * @see {@link init}
     */
    constructor(
        private readonly logUri: vscode.Uri | undefined,
        private readonly logger: Logger,
        contextPrefix: string
    ) {
        this.viewLogs = Commands.register(`aws.${contextPrefix}.viewLogs`, () => this.openLogUri())
        this.viewLogsAtMessage = Commands.register(`aws.${contextPrefix}.viewLogsAtMessage`, id => this.openLogId(id))
    }

    public async openLogUri(): Promise<vscode.TextEditor | undefined> {
        if (!this.logUri) {
            globals.logOutputChannel.show(true)
            return undefined
        }
        telemetry.toolkit_viewLogs.emit({ result: 'Succeeded' })
        return vscode.window.showTextDocument(this.logUri)
    }

    public async openLogId(logId: number) {
        if (!this.logUri) {
            globals.logOutputChannel.show(true)
            return
        }
        const msg = this.logger.getLogById(logId, this.logUri)
        const editor = await this.openLogUri()
        if (!msg || !editor) {
            return
        }

        // HACK: editor.document.getText() may return "stale" content, then
        // subsequent calls to openLogId() fail to highlight the specific log.
        // Invoke "revert" on the current file to force vscode to read from disk.
        await vscode.commands.executeCommand('workbench.action.files.revert').then(undefined, (e: Error) => {
            getLogger().warn('command failed: "workbench.action.files.revert"')
        })

        // Retrieve where the message starts by counting number of newlines
        const text = editor.document.getText()
        const textStart = text.indexOf(msg)
        if (textStart === -1) {
            this.logger.debug(`logging: unable to find message with id "${logId}"`)
            return
        }

        const lineStart = text.slice(0, textStart).split(/\r?\n/).filter(Boolean).length

        if (lineStart > 0) {
            const lineEnd = Math.min(editor.document.lineCount, lineStart + msg.split(/\r?\n/).filter(Boolean).length)
            revealLines(editor, lineStart, lineEnd)
        } else {
            clearSelection(editor)
        }
    }
}
