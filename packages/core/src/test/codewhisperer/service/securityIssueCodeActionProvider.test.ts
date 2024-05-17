/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { createCodeActionContext, createCodeScanIssue, createMockDocument } from '../testUtil'
import assert from 'assert'
import { SecurityIssueCodeActionProvider } from '../../../codewhisperer/service/securityIssueCodeActionProvider'

describe('securityIssueCodeActionProvider', () => {
    let securityIssueCodeActionProvider: SecurityIssueCodeActionProvider
    let mockDocument: vscode.TextDocument
    let context: vscode.CodeActionContext
    let token: vscode.CancellationTokenSource

    beforeEach(() => {
        securityIssueCodeActionProvider = new SecurityIssueCodeActionProvider()
        mockDocument = createMockDocument('def two_sum(nums, target):\nfor', 'test.py', 'python')
        context = createCodeActionContext()
        token = new vscode.CancellationTokenSource()
    })

    it('should provide quick fix for each issue that has a suggested fix', () => {
        securityIssueCodeActionProvider.issues = [
            {
                filePath: mockDocument.fileName,
                issues: [createCodeScanIssue({ title: 'issue 1' }), createCodeScanIssue({ title: 'issue 2' })],
            },
        ]
        const range = new vscode.Range(0, 0, 0, 0)
        const actual = securityIssueCodeActionProvider.provideCodeActions(mockDocument, range, context, token.token)

        assert.strictEqual(actual.length, 6)
        assert.strictEqual(actual[0].title, 'Amazon Q: Fix "issue 1"')
        assert.strictEqual(actual[0].kind, vscode.CodeActionKind.QuickFix)
        assert.strictEqual(actual[1].title, 'Amazon Q: View details for "issue 1"')
        assert.strictEqual(actual[1].kind, vscode.CodeActionKind.QuickFix)
        assert.strictEqual(actual[2].title, 'Amazon Q: Explain "issue 1"')
        assert.strictEqual(actual[2].kind, vscode.CodeActionKind.QuickFix)
        assert.strictEqual(actual[3].title, 'Amazon Q: Fix "issue 2"')
        assert.strictEqual(actual[3].kind, vscode.CodeActionKind.QuickFix)
        assert.strictEqual(actual[4].title, 'Amazon Q: View details for "issue 2"')
        assert.strictEqual(actual[4].kind, vscode.CodeActionKind.QuickFix)
        assert.strictEqual(actual[5].title, 'Amazon Q: Explain "issue 2"')
        assert.strictEqual(actual[5].kind, vscode.CodeActionKind.QuickFix)
    })

    it('should not provide quick fix if the issue does not have a suggested fix', () => {
        securityIssueCodeActionProvider.issues = [
            {
                filePath: mockDocument.fileName,
                issues: [createCodeScanIssue({ title: 'issue 1', suggestedFixes: [] })],
            },
        ]
        const range = new vscode.Range(0, 0, 0, 0)
        const actual = securityIssueCodeActionProvider.provideCodeActions(mockDocument, range, context, token.token)

        assert.strictEqual(actual.length, 2)
        assert.strictEqual(actual[0].title, 'Amazon Q: View details for "issue 1"')
        assert.strictEqual(actual[0].kind, vscode.CodeActionKind.QuickFix)
        assert.strictEqual(actual[1].title, 'Amazon Q: Explain "issue 1"')
        assert.strictEqual(actual[1].kind, vscode.CodeActionKind.QuickFix)
    })
})
