/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { SecurityIssueHoverProvider } from '../../../codewhisperer/service/securityIssueHoverProvider'
import { createCodeScanIssue, createMockDocument } from '../testUtil'
import assert from 'assert'
import { assertTelemetry } from '../../testUtil'

describe('securityIssueHoverProvider', () => {
    let securityIssueHoverProvider: SecurityIssueHoverProvider
    let mockDocument: vscode.TextDocument
    let token: vscode.CancellationTokenSource

    beforeEach(() => {
        securityIssueHoverProvider = new SecurityIssueHoverProvider()
        mockDocument = createMockDocument('def two_sum(nums, target):\nfor', 'test.py', 'python')
        token = new vscode.CancellationTokenSource()
    })

    it('should return hover for each issue for the current position', () => {
        const issues = [
            createCodeScanIssue({ findingId: 'finding-1', detectorId: 'language/detector-1', ruleId: 'Rule-123' }),
            createCodeScanIssue({
                findingId: 'finding-2',
                detectorId: 'language/detector-2',
                suggestedFixes: [],
                ruleId: 'Rule-456',
            }),
        ]

        securityIssueHoverProvider.issues = [
            {
                filePath: mockDocument.fileName,
                issues,
            },
        ]

        const actual = securityIssueHoverProvider.provideHover(mockDocument, new vscode.Position(0, 0), token.token)

        assert.strictEqual(actual.contents.length, 2)
        assert.strictEqual(
            (actual.contents[0] as vscode.MarkdownString).value,
            '## title ![High](severity-high.svg)\n' +
                'fix\n\n' +
                `[$(eye) View Details](command:aws.amazonq.openSecurityIssuePanel?${encodeURIComponent(
                    JSON.stringify([issues[0], mockDocument.fileName])
                )} 'Open "Amazon Q Security Issue"')\n` +
                ` | [$(comment) Explain](command:aws.amazonq.explainIssue?${encodeURIComponent(
                    JSON.stringify([issues[0]])
                )} 'Explain with Amazon Q')\n` +
                ` | [$(wrench) Fix](command:aws.amazonq.applySecurityFix?${encodeURIComponent(
                    JSON.stringify([issues[0], mockDocument.fileName, 'hover'])
                )} 'Fix with Amazon Q')\n` +
                '### Suggested Fix Preview\n\n' +
                '<span class="codicon codicon-none" style="background-color:var(--vscode-editorMarkerNavigationInfo-headerBackground);">\n\n' +
                '```undefined\n' +
                '@@ -1,1 +1,1 @@  \n' +
                '```\n\n' +
                '</span>\n' +
                '<br />\n' +
                '<span class="codicon codicon-none" style="background-color:var(--vscode-diffEditor-unchangedCodeBackground);">\n\n' +
                '```language\n' +
                'first line       \n' +
                '```\n\n' +
                '</span>\n' +
                '<br />\n' +
                '<span class="codicon codicon-none" style="background-color:var(--vscode-diffEditor-removedTextBackground);">\n\n' +
                '```diff\n' +
                '-second line     \n' +
                '```\n\n' +
                '</span>\n' +
                '<br />\n' +
                '<span class="codicon codicon-none" style="background-color:var(--vscode-diffEditor-insertedTextBackground);">\n\n' +
                '```diff\n' +
                '+third line      \n' +
                '```\n\n' +
                '</span>\n' +
                '<br />\n' +
                '<span class="codicon codicon-none" style="background-color:var(--vscode-diffEditor-unchangedCodeBackground);">\n\n' +
                '```language\n' +
                'fourth line      \n' +
                '```\n\n' +
                '</span>\n\n'
        )
        assert.strictEqual(
            (actual.contents[1] as vscode.MarkdownString).value,
            '## title ![High](severity-high.svg)\n' +
                'recommendationText\n\n' +
                `[$(eye) View Details](command:aws.amazonq.openSecurityIssuePanel?${encodeURIComponent(
                    JSON.stringify([issues[1], mockDocument.fileName])
                )} 'Open "Amazon Q Security Issue"')\n` +
                ` | [$(comment) Explain](command:aws.amazonq.explainIssue?${encodeURIComponent(
                    JSON.stringify([issues[1]])
                )} 'Explain with Amazon Q')\n`
        )
        assertTelemetry('codewhisperer_codeScanIssueHover', [
            { findingId: 'finding-1', detectorId: 'language/detector-1', ruleId: 'Rule-123', includesFix: true },
            { findingId: 'finding-2', detectorId: 'language/detector-2', ruleId: 'Rule-456', includesFix: false },
        ])
    })

    it('should return empty contents if there is no issue on the current position', () => {
        securityIssueHoverProvider.issues = [
            {
                filePath: mockDocument.fileName,
                issues: [createCodeScanIssue()],
            },
        ]

        const actual = securityIssueHoverProvider.provideHover(mockDocument, new vscode.Position(2, 0), token.token)
        assert.strictEqual(actual.contents.length, 0)
    })

    it('should skip issues not in the current file', () => {
        securityIssueHoverProvider.issues = [
            {
                filePath: 'some/path',
                issues: [createCodeScanIssue()],
            },
            {
                filePath: mockDocument.fileName,
                issues: [createCodeScanIssue()],
            },
        ]
        const actual = securityIssueHoverProvider.provideHover(mockDocument, new vscode.Position(0, 0), token.token)
        assert.strictEqual(actual.contents.length, 1)
    })

    it('should not show severity badge if undefined', () => {
        const issues = [createCodeScanIssue({ severity: undefined, suggestedFixes: [] })]
        securityIssueHoverProvider.issues = [
            {
                filePath: mockDocument.fileName,
                issues,
            },
        ]
        const actual = securityIssueHoverProvider.provideHover(mockDocument, new vscode.Position(0, 0), token.token)
        assert.strictEqual(actual.contents.length, 1)
        assert.strictEqual(
            (actual.contents[0] as vscode.MarkdownString).value,
            '## title \n' +
                'recommendationText\n\n' +
                `[$(eye) View Details](command:aws.amazonq.openSecurityIssuePanel?${encodeURIComponent(
                    JSON.stringify([issues[0], mockDocument.fileName])
                )} 'Open "Amazon Q Security Issue"')\n` +
                ` | [$(comment) Explain](command:aws.amazonq.explainIssue?${encodeURIComponent(
                    JSON.stringify([issues[0]])
                )} 'Explain with Amazon Q')\n`
        )
    })

    it('should handle fixes with consecutive lines removed', () => {
        const issues = [
            createCodeScanIssue({
                suggestedFixes: [
                    {
                        code: '@@ -1,1 +1,1 @@\nfirst line\n-second line\n-third line\n+fourth line\nfifth line',
                        description: 'fix',
                    },
                ],
            }),
        ]
        securityIssueHoverProvider.issues = [
            {
                filePath: mockDocument.fileName,
                issues,
            },
        ]
        const actual = securityIssueHoverProvider.provideHover(mockDocument, new vscode.Position(0, 0), token.token)
        assert.strictEqual(actual.contents.length, 1)
        assert.strictEqual(
            (actual.contents[0] as vscode.MarkdownString).value,
            '## title ![High](severity-high.svg)\n' +
                'fix\n\n' +
                `[$(eye) View Details](command:aws.amazonq.openSecurityIssuePanel?${encodeURIComponent(
                    JSON.stringify([issues[0], mockDocument.fileName])
                )} 'Open "Amazon Q Security Issue"')\n` +
                ` | [$(comment) Explain](command:aws.amazonq.explainIssue?${encodeURIComponent(
                    JSON.stringify([issues[0]])
                )} 'Explain with Amazon Q')\n` +
                ` | [$(wrench) Fix](command:aws.amazonq.applySecurityFix?${encodeURIComponent(
                    JSON.stringify([issues[0], mockDocument.fileName, 'hover'])
                )} 'Fix with Amazon Q')\n` +
                '### Suggested Fix Preview\n\n' +
                '<span class="codicon codicon-none" style="background-color:var(--vscode-editorMarkerNavigationInfo-headerBackground);">\n\n' +
                '```undefined\n' +
                '@@ -1,1 +1,1 @@  \n' +
                '```\n\n' +
                '</span>\n' +
                '<br />\n' +
                '<span class="codicon codicon-none" style="background-color:var(--vscode-diffEditor-unchangedCodeBackground);">\n\n' +
                '```language\n' +
                'first line       \n' +
                '```\n\n' +
                '</span>\n' +
                '<br />\n' +
                '<span class="codicon codicon-none" style="background-color:var(--vscode-diffEditor-removedTextBackground);">\n\n' +
                '```diff\n' +
                '-second line     \n' +
                '-third line      \n' +
                '```\n\n' +
                '</span>\n' +
                '<br />\n' +
                '<span class="codicon codicon-none" style="background-color:var(--vscode-diffEditor-insertedTextBackground);">\n\n' +
                '```diff\n' +
                '+fourth line     \n' +
                '```\n\n' +
                '</span>\n' +
                '<br />\n' +
                '<span class="codicon codicon-none" style="background-color:var(--vscode-diffEditor-unchangedCodeBackground);">\n\n' +
                '```language\n' +
                'fifth line       \n' +
                '```\n\n' +
                '</span>\n\n'
        )
    })
})
