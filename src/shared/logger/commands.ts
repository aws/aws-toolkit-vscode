/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Logger } from '.'
import { telemetry } from '../telemetry/spans'
import { Commands } from '../vscode/commands2'

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
    public static readonly declared = {
        viewLogs: Commands.from(this).declareOpenLogUri('aws.viewLogs'),
        viewLogsAtMessage: Commands.from(this).declareOpenLogId('aws.viewLogsAtMessage'),
    }

    public constructor(private readonly defaultLogUri: vscode.Uri, private readonly logger: Logger) {}

    public async openLogUri(logUri = this.defaultLogUri): Promise<vscode.TextEditor | undefined> {
        telemetry.vscode_viewLogs.emit() // Perhaps add additional argument to know which log was viewed?

        return vscode.window.showTextDocument(logUri)
    }

    public async openLogId(logId: number, logUri = this.defaultLogUri) {
        const msg = this.logger.getLogById(logId, logUri)
        const editor = await this.openLogUri(logUri)

        if (!msg || !editor) {
            return
        }

        // Retrieve where the message starts by counting number of newlines
        const text = editor.document.getText()
        const lineStart = text
            .slice(0, text.indexOf(msg))
            .split(/\r?\n/)
            .filter(x => x).length

        if (lineStart > 0) {
            const lineEnd = lineStart + msg.split(/\r?\n/).filter(x => x).length
            revealLines(editor, lineStart, lineEnd)
        } else {
            clearSelection(editor)
        }
    }
}
