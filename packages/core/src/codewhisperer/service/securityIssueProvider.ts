/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { AggregatedCodeScanIssue, CodeScanIssue, SuggestedFix } from '../models/model'
export class SecurityIssueProvider {
    static #instance: SecurityIssueProvider
    public static get instance() {
        return (this.#instance ??= new this())
    }

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
        const { changedRange, changedText, lineOffset } = event.contentChanges.reduce(
            (acc, change) => ({
                changedRange: acc.changedRange.union(change.range),
                changedText: acc.changedText + change.text,
                lineOffset: acc.lineOffset + this._getLineOffset(change.range, change.text),
            }),
            {
                changedRange: event.contentChanges[0].range,
                changedText: '',
                lineOffset: 0,
            }
        )

        this._issues = this._issues.map((group) => {
            if (group.filePath !== event.document.fileName) {
                return group
            }
            return {
                ...group,
                issues: group.issues
                    .filter((issue) => {
                        const range = new vscode.Range(
                            issue.startLine,
                            event.document.lineAt(issue.startLine)?.range.start.character ?? 0,
                            issue.endLine,
                            event.document.lineAt(issue.endLine - 1)?.range.end.character ?? 0
                        )
                        const intersection = changedRange.intersection(range)
                        return !(intersection && (/\S/.test(changedText) || changedText === ''))
                    })
                    .map((issue) => {
                        if (issue.startLine < changedRange.end.line) {
                            return issue
                        }
                        return {
                            ...issue,
                            startLine: issue.startLine + lineOffset,
                            endLine: issue.endLine + lineOffset,
                            suggestedFixes: issue.suggestedFixes.map((fix) =>
                                this._offsetSuggestedFix(fix, lineOffset)
                            ),
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

    private _offsetSuggestedFix(suggestedFix: SuggestedFix, lines: number): SuggestedFix {
        return {
            ...suggestedFix,
            code: suggestedFix.code?.replace(
                /^(@@ -)(\d+)(,\d+ \+)(\d+)(,\d+ @@)/,
                function (_fullMatch, ...groups: string[]) {
                    return (
                        groups[0] +
                        String(parseInt(groups[1]) + lines) +
                        groups[2] +
                        String(parseInt(groups[3]) + lines) +
                        groups[4]
                    )
                }
            ),
            references:
                suggestedFix.references?.map((ref) => ({
                    ...ref,
                    recommendationContentSpan: {
                        ...ref.recommendationContentSpan,
                        start: Number(ref.recommendationContentSpan?.start) + lines,
                        end: Number(ref.recommendationContentSpan?.end) + lines,
                    },
                })) ?? [],
        }
    }

    public removeIssue(uri: vscode.Uri, issue: CodeScanIssue) {
        this._issues = this._issues.map((group) => {
            if (group.filePath !== uri.fsPath) {
                return group
            }
            return {
                ...group,
                issues: group.issues.filter((i) => i.findingId !== issue.findingId),
            }
        })
    }

    public updateIssue(issue: CodeScanIssue, filePath?: string) {
        this._issues = this._issues.map((group) => {
            if (filePath && group.filePath !== filePath) {
                return group
            }
            return {
                ...group,
                issues: group.issues.map((i) => (i.findingId === issue.findingId ? issue : i)),
            }
        })
    }

    public mergeIssues(newIssues: AggregatedCodeScanIssue) {
        const existingGroup = this._issues.find((group) => group.filePath === newIssues.filePath)
        if (!existingGroup) {
            this._issues.push(newIssues)
            return
        }

        this._issues = this._issues.map((group) =>
            group.filePath !== newIssues.filePath
                ? group
                : {
                      ...group,
                      issues: [
                          ...group.issues,
                          ...newIssues.issues.filter((issue) => !this.isExistingIssue(issue, newIssues.filePath)),
                      ],
                  }
        )
    }

    private isExistingIssue(issue: CodeScanIssue, filePath: string) {
        return this._issues
            .find((group) => group.filePath === filePath)
            ?.issues.find(
                (i) => i.title === issue.title && i.startLine === issue.startLine && i.endLine === issue.endLine
            )
    }
}
