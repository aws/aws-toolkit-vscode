/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { SecurityIssueHoverProvider, SecurityIssueProvider } from 'aws-core-vscode/codewhisperer'
import { createCodeScanIssue, createMockDocument, assertTelemetry } from 'aws-core-vscode/test'
import assert from 'assert'

describe('securityIssueHoverProvider', () => {
    let securityIssueProvider: SecurityIssueProvider
    let securityIssueHoverProvider: SecurityIssueHoverProvider
    let mockDocument: vscode.TextDocument
    let token: vscode.CancellationTokenSource

    beforeEach(() => {
        securityIssueProvider = SecurityIssueProvider.instance
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

        securityIssueProvider.issues = [
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
                `[$(comment) Explain](command:aws.amazonq.explainIssue?${encodeURIComponent(
                    JSON.stringify([issues[0], mockDocument.fileName])
                )} 'Explain with Amazon Q')\n` +
                ` | [$(comment) Fix](command:aws.amazonq.generateFix?${encodeURIComponent(
                    JSON.stringify([issues[0], mockDocument.fileName])
                )} 'Fix with Amazon Q')\n` +
                ` | [$(error) Ignore](command:aws.amazonq.security.ignore?${encodeURIComponent(
                    JSON.stringify([issues[0], mockDocument.fileName, 'hover'])
                )} 'Ignore Issue')\n` +
                ` | [$(error) Ignore All](command:aws.amazonq.security.ignoreAll?${encodeURIComponent(
                    JSON.stringify([issues[0], 'hover'])
                )} 'Ignore Similar Issues')\n`
        )
        assert.strictEqual(
            (actual.contents[1] as vscode.MarkdownString).value,
            '## title ![High](severity-high.svg)\n' +
                'recommendationText\n\n' +
                `[$(comment) Explain](command:aws.amazonq.explainIssue?${encodeURIComponent(
                    JSON.stringify([issues[1], mockDocument.fileName])
                )} 'Explain with Amazon Q')\n` +
                ` | [$(comment) Fix](command:aws.amazonq.generateFix?${encodeURIComponent(
                    JSON.stringify([issues[1], mockDocument.fileName])
                )} 'Fix with Amazon Q')\n` +
                ` | [$(error) Ignore](command:aws.amazonq.security.ignore?${encodeURIComponent(
                    JSON.stringify([issues[1], mockDocument.fileName, 'hover'])
                )} 'Ignore Issue')\n` +
                ` | [$(error) Ignore All](command:aws.amazonq.security.ignoreAll?${encodeURIComponent(
                    JSON.stringify([issues[1], 'hover'])
                )} 'Ignore Similar Issues')\n`
        )
        assertTelemetry('codewhisperer_codeScanIssueHover', [
            { findingId: 'finding-1', detectorId: 'language/detector-1', ruleId: 'Rule-123', includesFix: true },
            { findingId: 'finding-2', detectorId: 'language/detector-2', ruleId: 'Rule-456', includesFix: false },
        ])
    })

    it('should return empty contents if there is no issue on the current position', () => {
        securityIssueProvider.issues = [
            {
                filePath: mockDocument.fileName,
                issues: [createCodeScanIssue()],
            },
        ]

        const actual = securityIssueHoverProvider.provideHover(mockDocument, new vscode.Position(2, 0), token.token)
        assert.strictEqual(actual.contents.length, 0)
    })

    it('should skip issues not in the current file', () => {
        securityIssueProvider.issues = [
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
        securityIssueProvider.issues = [
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
                `[$(comment) Explain](command:aws.amazonq.explainIssue?${encodeURIComponent(
                    JSON.stringify([issues[0], mockDocument.fileName])
                )} 'Explain with Amazon Q')\n` +
                ` | [$(comment) Fix](command:aws.amazonq.generateFix?${encodeURIComponent(
                    JSON.stringify([issues[0], mockDocument.fileName])
                )} 'Fix with Amazon Q')\n` +
                ` | [$(error) Ignore](command:aws.amazonq.security.ignore?${encodeURIComponent(
                    JSON.stringify([issues[0], mockDocument.fileName, 'hover'])
                )} 'Ignore Issue')\n` +
                ` | [$(error) Ignore All](command:aws.amazonq.security.ignoreAll?${encodeURIComponent(
                    JSON.stringify([issues[0], 'hover'])
                )} 'Ignore Similar Issues')\n`
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
        securityIssueProvider.issues = [
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
                `[$(comment) Explain](command:aws.amazonq.explainIssue?${encodeURIComponent(
                    JSON.stringify([issues[0], mockDocument.fileName])
                )} 'Explain with Amazon Q')\n` +
                ` | [$(comment) Fix](command:aws.amazonq.generateFix?${encodeURIComponent(
                    JSON.stringify([issues[0], mockDocument.fileName])
                )} 'Fix with Amazon Q')\n` +
                ` | [$(error) Ignore](command:aws.amazonq.security.ignore?${encodeURIComponent(
                    JSON.stringify([issues[0], mockDocument.fileName, 'hover'])
                )} 'Ignore Issue')\n` +
                ` | [$(error) Ignore All](command:aws.amazonq.security.ignoreAll?${encodeURIComponent(
                    JSON.stringify([issues[0], 'hover'])
                )} 'Ignore Similar Issues')\n`
        )
    })

    it('should not show issues that are not visible', () => {
        const issues = [createCodeScanIssue({ visible: false })]
        securityIssueProvider.issues = [
            {
                filePath: mockDocument.fileName,
                issues,
            },
        ]
        const actual = securityIssueHoverProvider.provideHover(mockDocument, new vscode.Position(0, 0), token.token)
        assert.strictEqual(actual.contents.length, 0)
    })
})
