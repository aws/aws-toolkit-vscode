/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as _ from 'lodash'
import * as vscode from 'vscode'
import { SnippetProvider } from './snippetProvider'

const MIN_MATCH_LENGTH = 3

/**
 * Provides AWS code snippets as {@link module:vscode.CompletionItem}s.
 *
 * The snippets are matched by (case-insensitive) prefix against items in the given {@link SnippetProvider}.
 * Snippets are only shown if one of the following is true:
 *   - The first word of the prefix is >= 3 chars and 3 chars of the first word have been typed (foo matches foobar).
 *   - The first word of the prefix is < 3 chars and the entire first word has been typed (e.g. s3 matches s3).
 *
 * Caveat: VSCode requires at least 1 snippet to be shown in order for snippets to be shown after more text is typed.
 * Therefore, if only 1 or 2 chars are typed that match (but don't complete) the first word of the prefix,
 * 1 snippet will always be shown.
 * @see https://github.com/microsoft/vscode/issues/13735
 */
export class SnippetCompletionItemProvider implements vscode.CompletionItemProvider {
    public constructor(private readonly snippetProvider: SnippetProvider) {}

    public async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken,
        context: vscode.CompletionContext
    ): Promise<vscode.CompletionItem[] | vscode.CompletionList> {
        if (context.triggerKind === vscode.CompletionTriggerKind.TriggerCharacter && context.triggerCharacter === ' ') {
            return []
        }

        const typedText = this.typedTextBeforePosition(document, position)
        if (!typedText) {
            return []
        }

        return this.findMatchingSnippets(typedText)
    }

    private typedTextBeforePosition(document: vscode.TextDocument, position: vscode.Position): string {
        const lineText = document.lineAt(position.line).text
        const lastSpacePosition = lineText.lastIndexOf(' ')
        const afterSpacesPosition = lastSpacePosition < 0 ? 0 : lastSpacePosition + 1

        return lineText.substring(afterSpacesPosition, position.character)
    }

    private findMatchingSnippets(typedText: string): vscode.CompletionItem[] | vscode.CompletionList {
        const typedTextLower = typedText.toLocaleLowerCase()
        const snippetCandidates = this.snippetProvider.findByPrefix(typedTextLower)
        if (_.isEmpty(snippetCandidates)) {
            return []
        }

        const isSufficientTextTyped = typedTextLower.length >= MIN_MATCH_LENGTH
        const matchingSnippets = isSufficientTextTyped
            ? snippetCandidates
            : snippetCandidates.filter(snippet => typedTextLower.length === snippet.firstWordLower.length)

        // VSCode won't call back again if empty array is returned, so always return at least 1 (potential) future match
        // See https://github.com/microsoft/vscode/issues/13735
        if (_.isEmpty(matchingSnippets)) {
            return new vscode.CompletionList([snippetCandidates[0].item], true)
        }

        return matchingSnippets.map(item => item.item)
    }
}
