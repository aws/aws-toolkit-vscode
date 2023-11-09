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
            createCodeScanIssue({ findingId: 'finding-1', detectorId: 'language/detector-1' }),
            createCodeScanIssue({
                findingId: 'finding-2',
                detectorId: 'language/detector-2',
                suggestedFixes: [],
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
                `[$(eye) View Details](command:aws.codeWhisperer.openSecurityIssuePanel?${encodeURIComponent(
                    JSON.stringify([issues[0], mockDocument.fileName])
                )} 'Open "CodeWhisperer Security Issue"')\n` +
                ` | [$(wrench) Apply Fix](command:aws.codeWhisperer.applySecurityFix?${encodeURIComponent(
                    JSON.stringify([issues[0], mockDocument.fileName, 'hover'])
                )} "Apply suggested fix")\n` +
                '### Suggested Fix Preview\n\n' +
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
            '## title ![High](severity-high.svg)\n' +
                'recommendationText\n\n' +
                `[$(eye) View Details](command:aws.codeWhisperer.openSecurityIssuePanel?${encodeURIComponent(
                    JSON.stringify([issues[1], mockDocument.fileName])
                )} 'Open "CodeWhisperer Security Issue"')\n`
        )
        assertTelemetry('codewhisperer_codeScanIssueHover', [
            { findingId: 'finding-1', detectorId: 'language/detector-1' },
            { findingId: 'finding-2', detectorId: 'language/detector-2' },
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
})
