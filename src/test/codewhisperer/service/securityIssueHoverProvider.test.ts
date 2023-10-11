/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { SecurityIssueHoverProvider } from '../../../codewhisperer/service/securityIssueHoverProvider'
import { createMockDocument } from '../testUtil'
import assert from 'assert'

describe('securityIssueHoverProvider', () => {
    describe('providerHover', () => {
        it('should return hover for each issue for the current position', () => {
            const securityIssueHoverProvider = new SecurityIssueHoverProvider()
            const mockDocument = createMockDocument('def two_sum(nums, target):\nfor', 'test.py', 'python')
            securityIssueHoverProvider.issues = [
                {
                    filePath: mockDocument.fileName,
                    issues: [
                        { startLine: 0, endLine: 1, comment: 'issue on this line' },
                        { startLine: 0, endLine: 1, comment: 'some other issue' },
                    ],
                },
            ]

            const token = new vscode.CancellationTokenSource()
            const actual = securityIssueHoverProvider.provideHover(mockDocument, new vscode.Position(0, 0), token.token)

            assert.strictEqual(actual.contents.length, 2)
            assert.strictEqual((actual.contents[0] as vscode.MarkdownString).value, 'TBD')
            assert.strictEqual((actual.contents[1] as vscode.MarkdownString).value, 'TBD')
        })

        it('should return empty contents if there is no issue on the current position', () => {
            const securityIssueHoverProvider = new SecurityIssueHoverProvider()
            const mockDocument = createMockDocument('def two_sum(nums, target):\nfor', 'test.py', 'python')
            securityIssueHoverProvider.issues = [
                {
                    filePath: mockDocument.fileName,
                    issues: [{ startLine: 0, endLine: 1, comment: 'issue on this line' }],
                },
            ]

            const token = new vscode.CancellationTokenSource()
            const actual = securityIssueHoverProvider.provideHover(mockDocument, new vscode.Position(2, 0), token.token)
            assert.strictEqual(actual.contents.length, 0)
        })
    })
})
