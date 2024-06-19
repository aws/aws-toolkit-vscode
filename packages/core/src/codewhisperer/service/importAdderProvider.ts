/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { isCloud9 } from '../../shared/extensionUtilities'
import { Recommendation } from '../client/codewhisperer'
import { CodeWhispererSettings } from '../util/codewhispererSettings'
import { findLineToInsertImportStatement } from '../util/importAdderUtil'
import { application } from '../util/codeWhispererApplication'

/**
 * ImportAdderProvider
 * For each code suggestion provided by CodeWhisperer,
 * it may contain un-imported variables. In this case,
 * the backend will also return the missing imports in the response
 * This provide will render a codeLens hint on screen to inform user
 * that once user accept the recommendation, import statement will also be inserted.
 */
export class ImportAdderProvider implements vscode.CodeLensProvider {
    private codeLens: vscode.CodeLens | undefined

    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>()
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event
    // This is the vsc languageIds that import adder service supports.
    private readonly supportedLanguages: string[] = ['java', 'javascript', 'javascriptreact', 'python']

    static #instance: ImportAdderProvider

    constructor() {
        application().clearCodeWhispererUIListener(_ => {
            this.clear()
        })
    }

    public static get instance() {
        return (this.#instance ??= new this())
    }

    public async onAcceptRecommendation(
        editor: vscode.TextEditor,
        r: Recommendation | undefined,
        firstLineOfRecommendation: number
    ) {
        this.clear()
        if (this.isNotEnabled(editor.document.languageId)) {
            return
        }
        if (
            r &&
            'mostRelevantMissingImports' in r &&
            r.mostRelevantMissingImports &&
            r.mostRelevantMissingImports!.length > 0
        ) {
            const line = findLineToInsertImportStatement(editor, firstLineOfRecommendation)
            let mergedStatements = ``
            r.mostRelevantMissingImports?.forEach(async i => {
                // trust service response that this to-be-added import is necessary
                if (i.statement) {
                    mergedStatements += i.statement + '\n'
                }
            })
            await editor.edit(
                builder => {
                    builder.insert(new vscode.Position(line, 0), mergedStatements)
                },
                { undoStopAfter: true, undoStopBefore: true }
            )
        }
    }

    private isNotEnabled(languageId: string): boolean {
        return (
            !this.supportedLanguages.includes(languageId) ||
            !CodeWhispererSettings.instance.isImportRecommendationEnabled() ||
            isCloud9()
        )
    }

    public onShowRecommendation(
        document: vscode.TextDocument,
        line: number,
        r: Recommendation
    ): vscode.CodeLens | undefined {
        if (this.isNotEnabled(document.languageId)) {
            return undefined
        }
        this.codeLens = undefined
        // show it under the inline toolbar if current line is not the last line
        line = document.lineCount > line + 1 ? line + 1 : line
        if (
            'mostRelevantMissingImports' in r &&
            r.mostRelevantMissingImports !== undefined &&
            r.mostRelevantMissingImports.length > 0
        ) {
            const n = r.mostRelevantMissingImports.length
            const stmt = r.mostRelevantMissingImports[0].statement
            let message = ''
            if (n === 1) {
                message = `If you accept, "${stmt}" will also be added.`
            } else if (n === 2) {
                message = `If you accept, "${stmt}" and 1 other import will also be added.`
            } else {
                message = `If you accept, "${stmt}" and ${n - 1} other imports will also be added.`
            }
            const codeLens = new vscode.CodeLens(new vscode.Range(line, 0, line, 1))
            codeLens.command = {
                title: message,
                tooltip: 'Import statement',
                command: '',
            }
            this.codeLens = codeLens
        }
        this._onDidChangeCodeLenses.fire()
        return this.codeLens
    }

    public clear() {
        this.codeLens = undefined
        this._onDidChangeCodeLenses.fire()
    }

    public provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
        if (this.codeLens) {
            return [this.codeLens]
        }
        return []
    }
}
