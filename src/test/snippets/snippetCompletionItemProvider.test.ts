/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import * as _ from 'lodash'
import { CompletableSnippet } from '../../snippets/completableSnippet'
import { SnippetCompletionItemProvider } from '../../snippets/snippetCompletionItemProvider'
import { SnippetProvider } from '../../snippets/snippetProvider'
import { instance, mock, when } from '../utilities/mockito'

describe('SnippetCompletionItemProvider', () => {
    const lineNumber = 42
    const cancellationToken = {} as vscode.CancellationToken
    const completionContext: vscode.CompletionContext = { triggerKind: vscode.CompletionTriggerKind.Invoke }

    const dynamodb = {
        getItem: snippet('dynamodb.getItem'),
        putItem: snippet('dynamodb.putItem'),
    }

    const s3 = {
        getObject: snippet('s3.getObject'),
        putObject: snippet('s3.putObject'),
    }

    let mockDocument: vscode.TextDocument

    beforeEach(() => {
        mockDocument = mock()
    })

    describe('provideCompletionItems', () => {
        it('returns all items when text matches normal prefix', async () => {
            when(mockDocument.lineAt(lineNumber)).thenReturn(textLine('DyNamO'))

            const snippets = (await snippetProvider(dynamodb.getItem, dynamodb.putItem).provideCompletionItems(
                instance(mockDocument),
                cursorPosition(6),
                cancellationToken,
                completionContext
            )) as vscode.CompletionItem[]

            assert.deepStrictEqual(
                _.sortBy(snippets, snippet => snippet.label),
                [dynamodb.getItem.item, dynamodb.putItem.item]
            )
        })

        it('returns all items, disregarding text before last space', async () => {
            when(mockDocument.lineAt(lineNumber)).thenReturn(textLine('S3 DyNamO'))

            const snippets = await snippetProvider(dynamodb.getItem).provideCompletionItems(
                instance(mockDocument),
                cursorPosition(9),
                cancellationToken,
                completionContext
            )

            assert.deepStrictEqual(snippets, [dynamodb.getItem.item])
        })

        it('returns all items when text matches short prefix', async () => {
            when(mockDocument.lineAt(lineNumber)).thenReturn(textLine('S3'))

            const snippets = (await snippetProvider(s3.getObject, s3.putObject).provideCompletionItems(
                instance(mockDocument),
                cursorPosition(2),
                cancellationToken,
                completionContext
            )) as vscode.CompletionItem[]

            assert.deepStrictEqual(
                _.sortBy(snippets, snippet => snippet.label),
                [s3.getObject.item, s3.putObject.item]
            )
        })

        it('returns single item in incomplete list when text is too short to match prefix', async () => {
            when(mockDocument.lineAt(lineNumber)).thenReturn(textLine('dy'))

            const snippets = (await snippetProvider(dynamodb.getItem, dynamodb.putItem).provideCompletionItems(
                instance(mockDocument),
                cursorPosition(2),
                cancellationToken,
                completionContext
            )) as vscode.CompletionList

            const [onlySnippet, ...otherSnippets] = snippets.items
            assert.ok(onlySnippet === dynamodb.getItem.item || onlySnippet === dynamodb.putItem.item)
            assert.deepStrictEqual(otherSnippets, [])

            assert.strictEqual(snippets.isIncomplete, true)
        })

        it('returns no items when triggered by a space', async () => {
            when(mockDocument.lineAt(lineNumber)).thenReturn(textLine('dynamo'))

            const snippets = await snippetProvider(dynamodb.getItem).provideCompletionItems(
                instance(mockDocument),
                cursorPosition(6),
                cancellationToken,
                { triggerKind: vscode.CompletionTriggerKind.TriggerCharacter, triggerCharacter: ' ' }
            )

            assert.deepStrictEqual(snippets, [])
        })

        it('returns no items when cursor is placed before text', async () => {
            when(mockDocument.lineAt(lineNumber)).thenReturn(textLine('dynamo'))

            const snippets = await snippetProvider(dynamodb.getItem).provideCompletionItems(
                instance(mockDocument),
                cursorPosition(0),
                cancellationToken,
                completionContext
            )

            assert.deepStrictEqual(snippets, [])
        })
    })

    function snippet(prefix: string): CompletableSnippet {
        return new CompletableSnippet(
            {
                prefix,
                description: 'description',
                body: ['body'],
            },
            'language'
        )
    }

    function textLine(text: string): vscode.TextLine {
        return { text } as vscode.TextLine
    }

    function cursorPosition(character: number): vscode.Position {
        return new vscode.Position(lineNumber, character)
    }

    function snippetProvider(...snippets: CompletableSnippet[]): SnippetCompletionItemProvider {
        return new SnippetCompletionItemProvider(new SnippetProvider(snippets))
    }
})
