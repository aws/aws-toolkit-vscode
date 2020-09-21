/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { debounce } from 'lodash'
import * as vscode from 'vscode'
import { plugins, automationActions } from 'aws-ssm-document-language-service'

const keywordDecoration = vscode.window.createTextEditorDecorationType({
    fontStyle: 'italic',
    fontWeight: 'bold',
})

function isSSMDocument(languageId: string): boolean {
    return languageId === 'ssm-json' || languageId === 'ssm-yaml'
}

export function activate(context: vscode.ExtensionContext) {
    // add keyword highlighting when active editor changed
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor && isSSMDocument(editor.document.languageId)) {
                updateKeywordHighlight(editor)
            }
        })
    )

    // add keyword highlighting when document changed
    const debounceUpdate = debounce(updateKeywordHighlight, 1000)
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => {
            if (
                vscode.window.activeTextEditor &&
                event.document === vscode.window.activeTextEditor.document &&
                isSSMDocument(event.document.languageId)
            ) {
                debounceUpdate(vscode.window.activeTextEditor)
            }
        })
    )

    // add keyword highlighting for the current active editor
    if (vscode.window.activeTextEditor && isSSMDocument(vscode.window.activeTextEditor.document.languageId)) {
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
