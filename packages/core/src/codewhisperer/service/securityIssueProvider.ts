/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AggregatedCodeScanIssue, CodeScanIssue, CodeScansState } from '../models/model'
export abstract class SecurityIssueProvider {
    private _issues: AggregatedCodeScanIssue[] = []
    public get issues() {
        return this._issues
    }

    public set issues(issues: AggregatedCodeScanIssue[]) {
        this._issues = issues
    }

    public handleDocumentChange(event: vscode.TextDocumentChangeEvent) {
        // handleDocumentChange function may be triggered while testing by our own code generation.
        if (!event.contentChanges || event.contentChanges.length === 0) {
            return
        }
        const changedRange = event.contentChanges[0].range
        const changedText = event.contentChanges[0].text
        const lineOffset = this._getLineOffset(changedRange, changedText)

        this._issues = this._issues.map(group => {
            if (group.filePath !== event.document.fileName) {
                return group
            }
            return {
                ...group,
                issues: group.issues
                    .filter(issue => {
                        const range = new vscode.Range(
                            issue.startLine,
                            event.document.lineAt(issue.startLine)?.range.start.character ?? 0,
                            issue.endLine,
                            event.document.lineAt(issue.endLine - 1)?.range.end.character ?? 0
                        )
                        const intersection = changedRange.intersection(range)
                        return !(
                            intersection &&
                            (/\S/.test(changedText) || changedText === '') &&
                            !CodeScansState.instance.isScansEnabled()
                        )
                    })
                    .map(issue => {
                        if (issue.startLine < changedRange.end.line) {
                            return issue
                        }
                        return {
                            ...issue,
                            startLine: issue.startLine + lineOffset,
                            endLine: issue.endLine + lineOffset,
                        }
                    }),
            }
        })
    }

    private _getLineOffset(range: vscode.Range, text: string) {
        const originLines = range.end.line - range.start.line + 1
        const changedLines = text.split('\n').length
        return changedLines - originLines
    }

    public removeIssue(uri: vscode.Uri, issue: CodeScanIssue) {
        this._issues = this._issues.map(group => {
            if (group.filePath !== uri.fsPath) {
                return group
            }
            return {
                ...group,
                issues: group.issues.filter(i => i.findingId !== issue.findingId),
            }
        })
    }
}
