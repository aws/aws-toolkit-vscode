/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as os from 'os'
import { InlineTask, TaskState } from '../controller/inlineTask'

export class CodelensProvider implements vscode.CodeLensProvider {
    private codeLenses: vscode.CodeLens[] = []
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>()
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event

    constructor(context: vscode.ExtensionContext) {
        context.subscriptions.push(vscode.languages.registerCodeLensProvider('*', this))
        this.provideCodeLenses = this.provideCodeLenses.bind(this)
    }

    public provideCodeLenses(_document: vscode.TextDocument, _token: vscode.CancellationToken): vscode.CodeLens[] {
        return this.codeLenses
    }

    public updateLenses(task: InlineTask): void {
        if (task.state === TaskState.Complete) {
            this.codeLenses = []
            this._onDidChangeCodeLenses.fire()
            return
        }
        switch (task.state) {
            case TaskState.InProgress: {
                this.codeLenses = []
                this.codeLenses.push(
                    new vscode.CodeLens(new vscode.Range(task.selectedRange.start, task.selectedRange.start), {
                        title: 'Amazon Q is generating...',
                        command: '',
                    })
                )
                break
            }
            case TaskState.WaitingForDecision: {
                let acceptTitle: string
                let rejectTitle: string
                if (os.platform() === 'darwin') {
                    acceptTitle = 'Accept ($(newline))'
                    rejectTitle = `Reject ( \u238B )`
                } else {
                    acceptTitle = 'Accept (Enter)'
                    rejectTitle = `Reject (Esc)`
                }

                this.codeLenses = []
                this.codeLenses.push(
                    new vscode.CodeLens(new vscode.Range(task.selectedRange.start, task.selectedRange.start), {
                        title: acceptTitle,
                        command: 'aws.amazonq.inline.waitForUserDecisionAcceptAll',
                        arguments: [task],
                    })
                )
                this.codeLenses.push(
                    new vscode.CodeLens(new vscode.Range(task.selectedRange.start, task.selectedRange.start), {
                        title: rejectTitle,
                        command: 'aws.amazonq.inline.waitForUserDecisionRejectAll',
                        arguments: [task],
                    })
                )
                break
            }
            default: {
                this.codeLenses = []
                break
            }
        }
        this._onDidChangeCodeLenses.fire()
    }
}
