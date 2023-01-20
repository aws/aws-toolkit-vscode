/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    CodeAction,
    CodeActionContext,
    CodeActionKind,
    CodeActionProvider,
    Diagnostic,
    languages,
    Position,
    Range,
    Selection,
    TextDocument,
} from 'vscode'
import { v4 as uuid } from 'uuid'
import { readImports } from '../utils/import-reader'
import { extractLanguageAndOtherContext } from './languages'
import { getErrorId } from '../utils/diagnostic'
import { Query } from '../models/model'

export class DiagnosticsSearchProvider implements CodeActionProvider {
    public activate(): void {
        languages.registerCodeActionsProvider('*', this)
    }

    async provideCodeActions(
        document: TextDocument,
        range: Range | Selection,
        context: CodeActionContext
    ): Promise<CodeAction[]> {
        const relevantLine = range.start.line
        const codeRange = new Range(new Position(Math.max(0, relevantLine - 1), 0), new Position(relevantLine + 1, 0))
        const code = document.getText(codeRange).trim()
        const lineWithError = document.lineAt(relevantLine).text
        const docContent = document.getText()
        const { language, otherContext } = extractLanguageAndOtherContext(document.languageId)
        const queryContext = {
            must: new Set<string>(),
            should: otherContext,
            mustNot: new Set<string>(),
        }
        if (language !== undefined) {
            queryContext.must.add(language)
        }
        const imports = await readImports(docContent, document.languageId)
        imports.forEach(importKey => queryContext.should.add(importKey))
        return context.diagnostics.map((diagnostic: Diagnostic): CodeAction => {
            const title = "Get Mynah's suggestions to address diagnostic."
            const query: Query = {
                queryId: uuid(),
                input: diagnostic.message,
                code,
                trigger: 'DiagnosticError',
                queryContext: {
                    must: Array.from(queryContext.must),
                    should: Array.from(queryContext.should),
                    mustNot: Array.from(queryContext.mustNot),
                },
                sourceId: getErrorId(diagnostic, document.uri.fsPath),
                codeSelection: {
                    selectedCode: '',
                    file: {
                        range: {
                            start: { row: '', column: '' },
                            end: { row: '', column: '' },
                        },
                        name: '',
                    },
                },
                headerInfo: {
                    content: `Diagnostic search for line ${relevantLine + 1}: ${lineWithError}`,
                },
            }
            const codeAction = new CodeAction(title, CodeActionKind.QuickFix)
            codeAction.diagnostics = [diagnostic]
            codeAction.command = {
                title,
                command: 'Mynah.search',
                arguments: [query],
            }
            return codeAction
        })
    }
}
