/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { SecurityIssueHoverProvider } from '../../../codewhisperer/service/securityIssueHoverProvider'
import { createMockDocument, createTextDocumentChangeEvent } from '../testUtil'
import assert from 'assert'
import { CodeScanIssue } from '../../../codewhisperer/models/model'
import sinon from 'sinon'

const makeIssue = (overrides?: Partial<CodeScanIssue>): CodeScanIssue => ({
    startLine: 0,
    endLine: 0,
    comment: 'comment',
    title: 'title',
    description: {
        text: 'description',
        markdown: 'description',
    },
    detectorId: 'language/cool-detector@v1.0',
    detectorName: 'detectorName',
    relatedVulnerabilities: [],
    severity: 'High',
    suggestedFixes: [
        { description: 'fix', code: '@@ -1,1 +1,1 @@\nfirst line\n-second line\n+third line\nfourth line' },
    ],
    ...overrides,
})

describe('securityIssueHoverProvider', () => {
    describe('providerHover', () => {
        it('should return hover for each issue for the current position', () => {
            sinon.stub(vscode.Uri, 'joinPath').callsFake(() => vscode.Uri.parse('myPath'))

            const securityIssueHoverProvider = new SecurityIssueHoverProvider()
            const mockDocument = createMockDocument('def two_sum(nums, target):\nfor', 'test.py', 'python')
            securityIssueHoverProvider.issues = [
                {
                    filePath: mockDocument.fileName,
                    issues: [
                        makeIssue({ startLine: 0, endLine: 1 }),
                        makeIssue({ startLine: 0, endLine: 1, suggestedFixes: [] }),
                    ],
                },
            ]

            const token = new vscode.CancellationTokenSource()
            const actual = securityIssueHoverProvider.provideHover(mockDocument, new vscode.Position(0, 0), token.token)

            assert.strictEqual(actual.contents.length, 2)
            assert.strictEqual(
                (actual.contents[0] as vscode.MarkdownString).value,
                '## Suggested Fix for title ![High](file:///myPath)\n' +
                    'description\n\n' +
                    '[$(eye) View Details](command:aws.codewhisperer.viewSecurityIssue)\n' +
                    ' | [$(wrench) Apply Fix](command:aws.codewhisperer.applySecurityFix)\n\n' +
                    '<span class="codicon codicon-none" style="background-color:var(--vscode-textCodeBlock-background);">\n\n' +
                    '```language\n' +
                    'first line    \n' +
                    '```\n\n' +
                    '</span>\n' +
                    '<br />\n' +
                    '<span class="codicon codicon-none" style="background-color:var(--vscode-diffEditor-removedTextBackground);">\n\n' +
                    '```diff\n' +
                    '-second line  \n' +
                    '```\n\n' +
                    '</span>\n' +
                    '<br />\n' +
                    '<span class="codicon codicon-none" style="background-color:var(--vscode-diffEditor-insertedTextBackground);">\n\n' +
                    '```diff\n' +
                    '+third line   \n' +
                    '```\n\n' +
                    '</span>\n' +
                    '<br />\n' +
                    '<span class="codicon codicon-none" style="background-color:var(--vscode-textCodeBlock-background);">\n\n' +
                    '```language\n' +
                    'fourth line   \n' +
                    '```\n\n' +
                    '</span>\n\n'
            )
            assert.strictEqual(
                (actual.contents[1] as vscode.MarkdownString).value,
                '## title ![High](file:///myPath)\n' +
                    'description\n\n' +
                    '[$(eye) View Details](command:aws.codewhisperer.viewSecurityIssue)\n'
            )
        })

        it('should return empty contents if there is no issue on the current position', () => {
            const securityIssueHoverProvider = new SecurityIssueHoverProvider()
            const mockDocument = createMockDocument('def two_sum(nums, target):\nfor', 'test.py', 'python')
            securityIssueHoverProvider.issues = [
                {
                    filePath: mockDocument.fileName,
                    issues: [makeIssue({ startLine: 0, endLine: 1 })],
                },
            ]

            const token = new vscode.CancellationTokenSource()
            const actual = securityIssueHoverProvider.provideHover(mockDocument, new vscode.Position(2, 0), token.token)
            assert.strictEqual(actual.contents.length, 0)
        })

        it('should update ranges if text document changed', () => {
            const securityIssueHoverProvider = new SecurityIssueHoverProvider()
            const mockDocument = createMockDocument('def two_sum(nums, target):\nfor', 'test.py', 'python')
            securityIssueHoverProvider.issues = [
                {
                    filePath: mockDocument.fileName,
                    issues: [makeIssue({ startLine: 0, endLine: 1 })],
                },
            ]

            const changeEvent = createTextDocumentChangeEvent(
                mockDocument,
                new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 1)),
                '\n'
            )
            securityIssueHoverProvider.updateRanges(changeEvent)

            const token = new vscode.CancellationTokenSource()
            let actual = securityIssueHoverProvider.provideHover(mockDocument, new vscode.Position(0, 0), token.token)
            assert.strictEqual(actual.contents.length, 0)

            actual = securityIssueHoverProvider.provideHover(mockDocument, new vscode.Position(1, 0), token.token)
            assert.strictEqual(actual.contents.length, 1)
        })
    })
})
