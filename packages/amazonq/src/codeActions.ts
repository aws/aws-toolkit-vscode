/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

export class CodeActions implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix,
        vscode.CodeActionKind.RefactorRewrite,
        vscode.CodeActionKind.Empty,
    ]

    private suffix: string = 'using Amazon Q'

    private commands: Map<string, { title: string; kind: vscode.CodeActionKind }> = new Map<
        string,
        { title: string; kind: vscode.CodeActionKind }
    >([
        ['aws.amazonq.explainCode', { title: `Explain ${this.suffix}`, kind: vscode.CodeActionKind.Empty }],
        ['aws.amazonq.refactorCode', { title: `Refactor ${this.suffix}`, kind: vscode.CodeActionKind.RefactorRewrite }],
        ['aws.amazonq.fixCode', { title: `Fix ${this.suffix}`, kind: vscode.CodeActionKind.QuickFix }],
        ['aws.amazonq.optimizeCode', { title: `Optimize ${this.suffix}`, kind: vscode.CodeActionKind.RefactorRewrite }],
        [
            'aws.amazonq.sendToPrompt',
            { title: `Add selection to ${this.suffix} prompt`, kind: vscode.CodeActionKind.Empty },
        ],
    ])

    provideCodeActions(): vscode.CodeAction[] {
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            return []
        }

        const selectedText = editor.document.getText(editor.selection)
        if (!selectedText) {
            return []
        }

        const codeActions: vscode.CodeAction[] = []

        this.commands.forEach(({ title, kind }, command) => {
            codeActions.push(this.createCodeAction(command, title, kind, selectedText))
        })

        return codeActions
    }

    private createCodeAction(
        command: string,
        title: string,
        kind: vscode.CodeActionKind,
        selectedText: string,
        isPreferred = false
    ): vscode.CodeAction {
        const action = new vscode.CodeAction(title, kind)
        action.command = {
            command,
            title,
            arguments: [selectedText],
        }
        action.isPreferred = isPreferred
        return action
    }
}
