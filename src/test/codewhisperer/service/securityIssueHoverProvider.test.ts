/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { SecurityIssueHoverProvider } from '../../../codewhisperer/service/securityIssueHoverProvider'
import { createCodeScanIssue, createMockDocument } from '../testUtil'
import assert from 'assert'
import sinon from 'sinon'

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
        sinon.stub(vscode.Uri, 'joinPath').callsFake(() => vscode.Uri.parse('myPath'))
        const issues = [createCodeScanIssue(), createCodeScanIssue({ suggestedFixes: [] })]

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
            '## Suggested Fix for title ![High](file:///myPath)\n' +
                'description\n\n' +
                `[$(eye) View Details](command:aws.codeWhisperer.openSecurityIssuePanel?${encodeURIComponent(
                    JSON.stringify(issues[0])
                )} 'Open "CodeWhisperer Security Issue"')\n` +
                ' | [$(wrench) Apply Fix](command:aws.codeWhisperer.applySecurityFix "Apply suggested fix")\n\n' +
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
                `[$(eye) View Details](command:aws.codeWhisperer.openSecurityIssuePanel?${encodeURIComponent(
                    JSON.stringify(issues[1])
                )} 'Open "CodeWhisperer Security Issue"')\n`
        )
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
