/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import { InsertSnippetCommandInput } from '../../snippets/commands/insertSnippet'
import { CompletableSnippet } from '../../snippets/completableSnippet'

describe('CompletableSnippet', () => {
    it('constructs a snippet', () => {
        const { item, prefixLower, firstWordLower } = new CompletableSnippet(
            {
                prefix: 'PreFix.for.Snippet',
                description: 'description',
                body: ['some', 'code'],
            },
            'javascript'
        )

        assert.strictEqual(item.label, 'PreFix.for.Snippet (Snippet)')
        assert.strictEqual(item.kind, vscode.CompletionItemKind.Snippet)
        assert.strictEqual((item.documentation as vscode.MarkdownString).value, '\n```\nsome\ncode\n```\n')
        assert.strictEqual((item.insertText as vscode.SnippetString).value, 'some\ncode')
        assert.strictEqual(item.detail, 'description')
        assert.strictEqual(item.sortText, 'z-PreFix.for.Snippet')
        assert.strictEqual(item.filterText, 'PreFix.for.Snippet')

        const expectedCommandInput: InsertSnippetCommandInput = {
            snippetPrefix: 'PreFix.for.Snippet',
            snippetLanguage: 'javascript',
        }
        assert.strictEqual(item.command?.title, 'Insert Snippet')
        assert.strictEqual(item.command?.command, 'snippet.insert')
        assert.deepStrictEqual(item.command?.arguments, [expectedCommandInput])

        assert.strictEqual(prefixLower, 'prefix.for.snippet')
        assert.strictEqual(firstWordLower, 'prefix')
    })
})
