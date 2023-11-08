/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { SecurityIssueProvider } from './securityIssueProvider'
import { CodeScanIssue } from '../models/model'
import { Component } from '../../shared/telemetry/telemetry'

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
                        const fixIssue = new vscode.CodeAction(
                            `Apply fix for "${issue.title}"`,
                            vscode.CodeActionKind.QuickFix
                        )
                        const args: [CodeScanIssue, string, Component] = [issue, group.filePath, 'quickfix']
                        fixIssue.command = {
                            title: 'Apply suggested fix',
                            command: 'aws.codeWhisperer.applySecurityFix',
                            arguments: args,
                        }
                        codeActions.push(fixIssue)
                    }
                    const openIssue = new vscode.CodeAction(`View details for "${issue.title}"`)
                    const args: [CodeScanIssue, string] = [issue, group.filePath]
                    openIssue.command = {
                        title: 'Open "CodeWhisperer Security Issue"',
                        command: 'aws.codeWhisperer.openSecurityIssuePanel',
                        arguments: args,
                    }
                    codeActions.push(openIssue)
                }
            }
        }

        return codeActions
    }
}
