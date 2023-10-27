/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { SecurityIssueProvider } from './securityIssueProvider'

export class SecurityIssueCodeActionProvider extends SecurityIssueProvider implements vscode.CodeActionProvider {
    static #instance: SecurityIssueCodeActionProvider

    public static get instance() {
        return (this.#instance ??= new this())
    }

    public provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        _context: vscode.CodeActionContext,
        _token: vscode.CancellationToken
    ): vscode.CodeAction[] {
        const codeActions: vscode.CodeAction[] = []

        for (const group of this.issues) {
            if (document.fileName !== group.filePath) {
                continue
            }

            for (const issue of group.issues) {
                const issueRange = new vscode.Range(issue.startLine, 0, issue.endLine, 0)
                if (issueRange.contains(range)) {
                    const [suggestedFix] = issue.suggestedFixes
                    if (suggestedFix) {
                        const fixIssue = new vscode.CodeAction(`Fix "${issue.title}"`, vscode.CodeActionKind.QuickFix)
                        // TODO: Add apply fix command
                        codeActions.push(fixIssue)
                    }
                }
            }
        }

        return codeActions
    }
}
