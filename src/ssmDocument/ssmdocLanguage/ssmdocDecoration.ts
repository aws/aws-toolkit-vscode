/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'path'
import * as vscode from 'vscode'
import { clearTimeout } from 'timers'
import { plugins, automationActions } from './resources/actionItems'

let pendingKeywordHighlight: NodeJS.Timeout

const keywordDecoration = vscode.window.createTextEditorDecorationType({
    //color: new vscode.ThemeColor('textLink.foreground'),
    fontStyle: 'italic',
    fontWeight: 'bold',
})

export function activate(context: vscode.ExtensionContext) {
    // add keyword highlighting when active editor changed
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => updateKeywordHighlight(editor), null, context.subscriptions)
    )

    // add keyword highlighting when document changed
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(
            event => {
                if (vscode.window.activeTextEditor && event.document === vscode.window.activeTextEditor.document) {
                    if (pendingKeywordHighlight) {
                        clearTimeout(pendingKeywordHighlight)
                    }
                    pendingKeywordHighlight = setTimeout(
                        () => updateKeywordHighlight(vscode.window.activeTextEditor),
                        1000
                    )
                }
            },
            null,
            context.subscriptions
        )
    )

    // add keyword highlighting for the current active editor
    updateKeywordHighlight(vscode.window.activeTextEditor)

    // add keyword highlighting when cursor moves
    context.subscriptions.push(
        vscode.window.onDidChangeTextEditorSelection(event => {
            if (event.textEditor === vscode.window.activeTextEditor) {
                updateKeywordHighlight(event.textEditor)
            }
        })
    )
}

function isValidAction(action: string) {
    return plugins.includes(action) || automationActions.includes(action)
}

function updateKeywordHighlight(editor: vscode.TextEditor | undefined) {
    if (!editor) {
        return
    }
    let extName = path.extname(editor.document.fileName)
    if (!path.basename(editor.document.fileName, extName).endsWith('.ssmdoc')) {
        return
    }

    const ranges: vscode.Range[] = []
    const pattern = /aws:[a-zA-Z]+/g
    let match: RegExpExecArray | null
    let docText = editor.document.getText()

    do {
        match = pattern.exec(docText)
        if (match && isValidAction(match[0])) {
            ranges.push(
                new vscode.Range(
                    editor.document.positionAt(match.index),
                    editor.document.positionAt(match.index + match[0].length)
                )
            )
        }
    } while (match)

    editor.setDecorations(keywordDecoration, ranges)
}
