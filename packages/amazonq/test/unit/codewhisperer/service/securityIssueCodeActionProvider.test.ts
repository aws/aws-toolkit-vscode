/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { createCodeActionContext, createCodeScanIssue, createMockDocument } from 'aws-core-vscode/test'
import assert from 'assert'
import { SecurityIssueCodeActionProvider, SecurityIssueProvider } from 'aws-core-vscode/codewhisperer'

describe('securityIssueCodeActionProvider', () => {
    let securityIssueProvider: SecurityIssueProvider
    let securityIssueCodeActionProvider: SecurityIssueCodeActionProvider
    let mockDocument: vscode.TextDocument
    let context: vscode.CodeActionContext
    let token: vscode.CancellationTokenSource

    beforeEach(() => {
        securityIssueProvider = SecurityIssueProvider.instance
        securityIssueCodeActionProvider = new SecurityIssueCodeActionProvider()
        mockDocument = createMockDocument('def two_sum(nums, target):\nfor', 'test.py', 'python')
        context = createCodeActionContext()
        token = new vscode.CancellationTokenSource()
    })

    it('should provide quick fix for each issue that has a suggested fix', () => {
        securityIssueProvider.issues = [
            {
                filePath: mockDocument.fileName,
                issues: [createCodeScanIssue({ title: 'issue 1' }), createCodeScanIssue({ title: 'issue 2' })],
            },
        ]
        const range = new vscode.Range(0, 0, 0, 0)
        const actual = securityIssueCodeActionProvider.provideCodeActions(mockDocument, range, context, token.token)

        assert.strictEqual(actual.length, 10)
        assert.strictEqual(actual[0].title, 'Amazon Q: Fix "issue 1"')
        assert.strictEqual(actual[0].kind, vscode.CodeActionKind.QuickFix)
        assert.strictEqual(actual[1].title, 'Amazon Q: View details for "issue 1"')
        assert.strictEqual(actual[1].kind, vscode.CodeActionKind.QuickFix)
        assert.strictEqual(actual[2].title, 'Amazon Q: Explain "issue 1"')
        assert.strictEqual(actual[2].kind, vscode.CodeActionKind.QuickFix)
        assert.strictEqual(actual[3].title, 'Amazon Q: Ignore this "issue 1" issue')
        assert.strictEqual(actual[3].kind, vscode.CodeActionKind.QuickFix)
        assert.strictEqual(actual[4].title, 'Amazon Q: Ignore all "issue 1" issues')
        assert.strictEqual(actual[4].kind, vscode.CodeActionKind.QuickFix)
        assert.strictEqual(actual[5].title, 'Amazon Q: Fix "issue 2"')
        assert.strictEqual(actual[5].kind, vscode.CodeActionKind.QuickFix)
        assert.strictEqual(actual[6].title, 'Amazon Q: View details for "issue 2"')
        assert.strictEqual(actual[6].kind, vscode.CodeActionKind.QuickFix)
        assert.strictEqual(actual[7].title, 'Amazon Q: Explain "issue 2"')
        assert.strictEqual(actual[7].kind, vscode.CodeActionKind.QuickFix)
    })

    it('should not provide quick fix if the issue does not have a suggested fix', () => {
        securityIssueProvider.issues = [
            {
                filePath: mockDocument.fileName,
                issues: [createCodeScanIssue({ title: 'issue 1', suggestedFixes: [] })],
            },
        ]
        const range = new vscode.Range(0, 0, 0, 0)
        const actual = securityIssueCodeActionProvider.provideCodeActions(mockDocument, range, context, token.token)

        assert.strictEqual(actual.length, 4)
        assert.strictEqual(actual[0].title, 'Amazon Q: View details for "issue 1"')
        assert.strictEqual(actual[0].kind, vscode.CodeActionKind.QuickFix)
        assert.strictEqual(actual[1].title, 'Amazon Q: Explain "issue 1"')
        assert.strictEqual(actual[1].kind, vscode.CodeActionKind.QuickFix)
        assert.strictEqual(actual[2].title, 'Amazon Q: Ignore this "issue 1" issue')
        assert.strictEqual(actual[2].kind, vscode.CodeActionKind.QuickFix)
        assert.strictEqual(actual[3].title, 'Amazon Q: Ignore all "issue 1" issues')
        assert.strictEqual(actual[3].kind, vscode.CodeActionKind.QuickFix)
    })

    it('should skip issues not in the current file', () => {
        securityIssueProvider.issues = [
            {
                filePath: 'some/path',
                issues: [createCodeScanIssue({ title: 'issue 1' })],
            },
            {
                filePath: mockDocument.fileName,
                issues: [createCodeScanIssue({ title: 'issue 2' })],
            },
        ]
        const range = new vscode.Range(0, 0, 0, 0)
        const actual = securityIssueCodeActionProvider.provideCodeActions(mockDocument, range, context, token.token)

        assert.strictEqual(actual.length, 5)
        assert.strictEqual(actual[0].title, 'Amazon Q: Fix "issue 2"')
        assert.strictEqual(actual[1].title, 'Amazon Q: View details for "issue 2"')
        assert.strictEqual(actual[2].title, 'Amazon Q: Explain "issue 2"')
        assert.strictEqual(actual[3].title, 'Amazon Q: Ignore this "issue 2" issue')
        assert.strictEqual(actual[4].title, 'Amazon Q: Ignore all "issue 2" issues')
    })

    it('should not show issues that are not visible', () => {
        securityIssueProvider.issues = [
            {
                filePath: mockDocument.fileName,
                issues: [createCodeScanIssue({ visible: false })],
            },
        ]
        const range = new vscode.Range(0, 0, 0, 0)
        const actual = securityIssueCodeActionProvider.provideCodeActions(mockDocument, range, context, token.token)

        assert.strictEqual(actual.length, 0)
    })
})
