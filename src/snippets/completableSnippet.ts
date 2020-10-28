/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { InsertSnippetCommandInput } from './commands/insertSnippet'
import { Snippet } from './snippetParser'
import { localize } from '../shared/utilities/vsCodeUtils'

const PREFIX_WORD_SEPARATOR = '.' // e.g. 'dynamodb.getItem' has words 'dynamodb' and 'getItem'

/**
 * Represents a precomputed snippet {@link CompletionItem} along with metadata for indexing.
 */
export class CompletableSnippet {
    public readonly item: vscode.CompletionItem
    public readonly prefixLower: string
    public readonly firstWordLower: string

    public constructor(snippet: Snippet, language: string) {
        this.item = this.createCompletionItem(snippet, language)
        this.prefixLower = snippet.prefix.toLocaleLowerCase()
        this.firstWordLower = this.prefixLower.split(PREFIX_WORD_SEPARATOR)[0]
    }

    private createCompletionItem(snippet: Snippet, language: string): vscode.CompletionItem {
        const label = localize('AWS.snippets.label', '{0} (Snippet)', snippet.prefix)
        const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Snippet)
        item.detail = snippet.description
        item.sortText = `z-${snippet.prefix}`
        item.filterText = snippet.prefix

        const code = snippet.body.join('\n')
        item.documentation = new vscode.MarkdownString().appendCodeblock(code)
        item.insertText = new vscode.SnippetString(code)

        const commandInput: InsertSnippetCommandInput = { snippetPrefix: snippet.prefix, snippetLanguage: language }
        item.command = {
            title: 'Insert Snippet',
            command: 'snippet.insert',
            arguments: [commandInput],
        }
        return item
    }
}
