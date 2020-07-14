/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { clearTimeout } from 'timers'
import { plugins, automationActions } from 'aws-ssm-document-language-service'

let pendingKeywordHighlight: NodeJS.Timeout

const keywordDecoration = vscode.window.createTextEditorDecorationType({
    fontStyle: 'italic',
    fontWeight: 'bold',
})

export function activate(context: vscode.ExtensionContext) {
    // add keyword highlighting when active editor changed
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor && (editor.document.languageId === 'ssm-yaml' || editor.document.languageId === 'ssm-json')) {
                updateKeywordHighlight(editor), null, context.subscriptions
            }
        })
    )

    // add keyword highlighting when document changed
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(
            event => {
                if (
                    vscode.window.activeTextEditor &&
                    event.document === vscode.window.activeTextEditor.document &&
                    (event.document.languageId === 'ssm-yaml' || event.document.languageId === 'ssm-json')
                ) {
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
    if (
        vscode.window.activeTextEditor &&
        (vscode.window.activeTextEditor.document.languageId === 'ssm-json' ||
            vscode.window.activeTextEditor?.document.languageId === 'ssm-yaml')
    ) {
        updateKeywordHighlight(vscode.window.activeTextEditor)
    }
}

function isValidAction(action: string) {
    return plugins.includes(action) || automationActions.includes(action)
}

function updateKeywordHighlight(editor: vscode.TextEditor | undefined) {
    if (!editor) {
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
