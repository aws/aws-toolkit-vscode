/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import * as vscode from 'vscode'

import { getCompletionItems, getCompletionItem, getLabel } from '../../../codewhisperer/service/completionProvider'
import { createMockDocument, resetCodeWhispererGlobalVariables } from '../testUtil'
import { Recommendation } from '../../../codewhisperer/client/codewhisperer'
import { RecommendationHandler } from '../../../codewhisperer/service/recommendationHandler'
import { session } from '../../../codewhisperer/util/codeWhispererSession'

describe('completionProviderService', function () {
    beforeEach(async function () {
        await resetCodeWhispererGlobalVariables()
    })

    describe('getLabel', function () {
        it('should return correct label given recommendation longer than Constants.LABEL_LENGTH', function () {
            const mockLongRecommendation = `
            const metaDataFile = path.join(__dirname, 'nls.metadata.json');
            const locale = getUserDefinedLocale(argvConfig);`
            const expected = '\n            const m..'
            assert.strictEqual(getLabel(mockLongRecommendation), expected)
        })

        it('should return correct label given short recommendation', function () {
            const mockShortRecommendation = 'function onReady()'
            const expected = 'function onReady()..'
            assert.strictEqual(getLabel(mockShortRecommendation), expected)
        })
    })

    describe('getCompletionItem', function () {
        it('should return targetCompletionItem given input', function () {
            session.startPos = new vscode.Position(0, 0)
            RecommendationHandler.instance.requestId = 'mock_requestId_getCompletionItem'
            session.sessionId = 'mock_sessionId_getCompletionItem'
            const mockPosition = new vscode.Position(0, 1)
            const mockRecommendationDetail: Recommendation = {
                content: "\n\t\tconsole.log('Hello world!');\n\t}",
            }
            const mockRecommendationIndex = 1
            const mockDocument = createMockDocument('', 'test.ts', 'typescript')
            const expected: vscode.CompletionItem = {
                label: "\n\t\tconsole.log('Hell..",
                kind: 1,
                detail: 'CodeWhisperer',
                documentation: new vscode.MarkdownString().appendCodeblock(
                    "\n\t\tconsole.log('Hello world!');\n\t}",
                    'typescript'
                ),
                sortText: '0000000002',
                preselect: true,
                insertText: new vscode.SnippetString("\n\t\tconsole.log('Hello world!');\n\t}"),
                keepWhitespace: true,
                command: {
                    command: 'aws.codeWhisperer.accept',
                    title: 'On acceptance',
                    arguments: [
                        new vscode.Range(0, 0, 0, 0),
                        1,
                        "\n\t\tconsole.log('Hello world!');\n\t}",
                        'mock_requestId_getCompletionItem',
                        'mock_sessionId_getCompletionItem',
                        'OnDemand',
                        'Line',
                        'typescript',
                        undefined,
                    ],
                },
            }
            const actual = getCompletionItem(
                mockDocument,
                mockPosition,
                mockRecommendationDetail,
                mockRecommendationIndex
            )
            assert.deepStrictEqual(actual.command, expected.command)
            assert.strictEqual(actual.sortText, expected.sortText)
            assert.strictEqual(actual.label, expected.label)
            assert.strictEqual(actual.kind, expected.kind)
            assert.strictEqual(actual.preselect, expected.preselect)
            assert.strictEqual(actual.keepWhitespace, expected.keepWhitespace)
            assert.strictEqual(JSON.stringify(actual.documentation), JSON.stringify(expected.documentation))
            assert.strictEqual(JSON.stringify(actual.insertText), JSON.stringify(expected.insertText))
        })
    })

    describe('getCompletionItems', function () {
        it('should return completion items for each non-empty recommendation', async function () {
            session.recommendations = [
                { content: "\n\t\tconsole.log('Hello world!');\n\t}" },
                { content: '\nvar a = 10' },
            ]
            const mockPosition = new vscode.Position(0, 0)
            const mockDocument = createMockDocument('', 'test.ts', 'typescript')
            const actual = getCompletionItems(mockDocument, mockPosition)
            assert.strictEqual(actual.length, 2)
        })

        it('should return empty completion items when recommendation is empty', async function () {
            session.recommendations = []
            const mockPosition = new vscode.Position(14, 83)
            const mockDocument = createMockDocument()
            const actual = getCompletionItems(mockDocument, mockPosition)
            const expected: vscode.CompletionItem[] = []
            assert.deepStrictEqual(actual, expected)
        })
    })
})
