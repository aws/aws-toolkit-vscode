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
    private _disableEventHandler: boolean = false
    public get issues() {
        return this._issues
    }

    public set issues(issues: AggregatedCodeScanIssue[]) {
        this._issues = issues
    }

    public disableEventHandler() {
        this._disableEventHandler = true
    }

    public handleDocumentChange(event: vscode.TextDocumentChangeEvent) {
        // handleDocumentChange function may be triggered while testing by our own code generation.
        if (!event.contentChanges || event.contentChanges.length === 0) {
            return
        }
        if (this._disableEventHandler) {
            this._disableEventHandler = false
            return
        }
        const { changedRange, lineOffset } = event.contentChanges.reduce(
            (acc, change) => ({
                changedRange: acc.changedRange.union(change.range),
                lineOffset: acc.lineOffset + this._getLineOffset(change.range, change.text),
            }),
            {
                changedRange: event.contentChanges[0].range,
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
                    .filter(
                        (issue) =>
                            // Filter out any modified issues
                            !changedRange.intersection(
                                new vscode.Range(
                                    issue.startLine,
                                    event.document.lineAt(issue.startLine)?.range.start.character ?? 0,
                                    issue.endLine,
                                    event.document.lineAt(issue.endLine)?.range.end.character ?? 0
                                )
                            )
                    )
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
}
