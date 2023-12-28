/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AggregatedCodeScanIssue } from '../models/model'
import { ToolkitError } from '../../shared/errors'
export abstract class SecurityIssueProvider {
    private _issues: AggregatedCodeScanIssue[] = []
    public get issues() {
        return this._issues
    }

    public set issues(issues: AggregatedCodeScanIssue[]) {
        this._issues = issues
    }

    public handleDocumentChange(event: vscode.TextDocumentChangeEvent) {
        if (!event.contentChanges || event.contentChanges.length === 0) {
            throw new ToolkitError(`invalid event.contentChanges: ${JSON.stringify(event.contentChanges)}`)
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
                        const range = new vscode.Range(issue.startLine, 0, issue.endLine, 0)
                        const intersection = changedRange.intersection(range)
                        return !(intersection && (/\S/.test(changedText) || changedText === ''))
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
}
