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

    function buildCommandLink(command: string, args: any[], label: string, tooltip: string): string {
        return `[$(${command.includes('comment') ? 'comment' : 'error'}) ${label}](command:${command}?${encodeURIComponent(JSON.stringify(args))} '${tooltip}')`
    }

    function buildExpectedContent(issue: any, fileName: string, description: string, severity?: string): string {
        const severityBadge = severity ? ` ![${severity}](severity-${severity.toLowerCase()}.svg)` : ' '
        const commands = [
            buildCommandLink('aws.amazonq.explainIssue', [issue, fileName], 'Explain', 'Explain with Amazon Q'),
            buildCommandLink('aws.amazonq.generateFix', [issue, fileName], 'Fix', 'Fix with Amazon Q'),
            buildCommandLink('aws.amazonq.security.ignore', [issue, fileName, 'hover'], 'Ignore', 'Ignore Issue'),
            buildCommandLink('aws.amazonq.security.ignoreAll', [issue, 'hover'], 'Ignore All', 'Ignore Similar Issues'),
        ]
        return `## title${severityBadge}\n${description}\n\n${commands.join('\n | ')}\n`
    }

    function setupIssues(issues: any[]): void {
        securityIssueProvider.issues = [{ filePath: mockDocument.fileName, issues }]
    }

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

        setupIssues(issues)
        const actual = securityIssueHoverProvider.provideHover(mockDocument, new vscode.Position(0, 0), token.token)

        assert.strictEqual(actual.contents.length, 2)
        assert.strictEqual(
            (actual.contents[0] as vscode.MarkdownString).value,
            buildExpectedContent(issues[0], mockDocument.fileName, 'fix', 'High')
        )
        assert.strictEqual(
            (actual.contents[1] as vscode.MarkdownString).value,
            buildExpectedContent(issues[1], mockDocument.fileName, 'recommendationText', 'High')
        )
        assertTelemetry('codewhisperer_codeScanIssueHover', [
            { findingId: 'finding-1', detectorId: 'language/detector-1', ruleId: 'Rule-123', includesFix: true },
            { findingId: 'finding-2', detectorId: 'language/detector-2', ruleId: 'Rule-456', includesFix: false },
        ])
    })

    it('should return empty contents if there is no issue on the current position', () => {
        setupIssues([createCodeScanIssue()])
        const actual = securityIssueHoverProvider.provideHover(mockDocument, new vscode.Position(2, 0), token.token)
        assert.strictEqual(actual.contents.length, 0)
    })

    it('should skip issues not in the current file', () => {
        securityIssueProvider.issues = [
            { filePath: 'some/path', issues: [createCodeScanIssue()] },
            { filePath: mockDocument.fileName, issues: [createCodeScanIssue()] },
        ]
        const actual = securityIssueHoverProvider.provideHover(mockDocument, new vscode.Position(0, 0), token.token)
        assert.strictEqual(actual.contents.length, 1)
    })

    it('should not show severity badge if undefined', () => {
        const issues = [createCodeScanIssue({ severity: undefined, suggestedFixes: [] })]
        setupIssues(issues)
        const actual = securityIssueHoverProvider.provideHover(mockDocument, new vscode.Position(0, 0), token.token)
        assert.strictEqual(actual.contents.length, 1)
        assert.strictEqual(
            (actual.contents[0] as vscode.MarkdownString).value,
            buildExpectedContent(issues[0], mockDocument.fileName, 'recommendationText')
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
        setupIssues(issues)
        const actual = securityIssueHoverProvider.provideHover(mockDocument, new vscode.Position(0, 0), token.token)
        assert.strictEqual(actual.contents.length, 1)
        assert.strictEqual(
            (actual.contents[0] as vscode.MarkdownString).value,
            buildExpectedContent(issues[0], mockDocument.fileName, 'fix', 'High')
        )
    })

    it('should not show issues that are not visible', () => {
        setupIssues([createCodeScanIssue({ visible: false })])
        const actual = securityIssueHoverProvider.provideHover(mockDocument, new vscode.Position(0, 0), token.token)
        assert.strictEqual(actual.contents.length, 0)
    })
})
