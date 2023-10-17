/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { AggregatedCodeScanIssue, CodeScanIssue } from '../models/model'
import globals from '../../shared/extensionGlobals'

export class SecurityIssueHoverProvider implements vscode.HoverProvider {
    static #instance: SecurityIssueHoverProvider
    private _issues: AggregatedCodeScanIssue[] = []

    public static get instance() {
        return (this.#instance ??= new this())
    }

    public set issues(issues: AggregatedCodeScanIssue[]) {
        this._issues = issues
    }

    public provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken
    ): vscode.Hover {
        const contents: vscode.MarkdownString[] = []

        for (const group of this._issues) {
            if (document.fileName !== group.filePath) {
                continue
            }

            for (const issue of group.issues) {
                const range = new vscode.Range(issue.startLine, 0, issue.endLine, 0)
                if (range.contains(position)) {
                    contents.push(this._getContent(issue))
                }
            }
        }

        return new vscode.Hover(contents)
    }

    public updateRanges(event: vscode.TextDocumentChangeEvent) {
        const changedRange = event.contentChanges[0].range
        const changedText = event.contentChanges[0].text
        const lineOffset = this._getLineOffset(changedRange, changedText)

        this._issues = this._issues.map(issues => this._applyRangeOffset(event.document.fileName, issues, lineOffset))
    }

    private _getLineOffset(range: vscode.Range, text: string) {
        const originLines = range.end.line - range.start.line + 1
        const changedLines = text.split('\n').length
        return changedLines - originLines
    }

    private _applyRangeOffset(
        fileName: string,
        aggregatedIssues: AggregatedCodeScanIssue,
        lineOffset: number
    ): AggregatedCodeScanIssue {
        if (aggregatedIssues.filePath !== fileName) {
            return aggregatedIssues
        }
        return {
            ...aggregatedIssues,
            issues: aggregatedIssues.issues.map(issue => ({
                ...issue,
                startLine: issue.startLine + lineOffset,
                endLine: issue.endLine + lineOffset,
            })),
        }
    }

    private _getContent(issue: CodeScanIssue) {
        const markdownString = new vscode.MarkdownString()
        markdownString.isTrusted = true
        markdownString.supportHtml = true
        markdownString.supportThemeIcons = true

        const [suggestedFix] = issue.suggestedFixes ?? []

        if (suggestedFix) {
            markdownString.appendMarkdown(
                `## Suggested Fix for ${issue.title} ${this._makeSeverityBadge(issue.severity)}\n`
            )
        } else {
            markdownString.appendMarkdown(`## ${issue.title} ${this._makeSeverityBadge(issue.severity)}\n`)
        }

        markdownString.appendMarkdown(`${issue.description.markdown}\n\n`)

        const viewDetailsCommand = vscode.Uri.parse('command:aws.codewhisperer.viewSecurityIssue')
        const applyFixCommand = vscode.Uri.parse('command:aws.codewhisperer.applySecurityFix')
        markdownString.appendMarkdown(`[$(eye) View Details](${viewDetailsCommand})\n`)

        if (suggestedFix) {
            markdownString.appendMarkdown(` | [$(wrench) Apply Fix](${applyFixCommand})\n`)
            markdownString.appendMarkdown(
                `${this._makeCodeBlock(suggestedFix.code, issue.detectorId.split('/').shift())}\n`
            )
        }

        return markdownString
    }

    private _makeSeverityBadge(severity: string) {
        if (!severity) {
            return ''
        }
        return `![${severity}](${vscode.Uri.joinPath(
            globals.context.extensionUri,
            `src/codewhisperer/images/severity-${severity.toLowerCase()}.svg`
        )})`
    }

    /**
     * Creates a markdown string to render a code diff block for a given code block. Lines
     * that are highlighted red indicate deletion while lines highlighted in green indicate
     * addition. An optional language can be provided for syntax highlighting on lines which are
     * not additions or deletions.
     *
     * @param code The code containing the diff
     * @param language The language for syntax highlighting
     * @returns The markdown string
     */
    private _makeCodeBlock(code: string, language?: string) {
        const lines = code.split('\n').slice(1) // Ignore the first line for diff header
        // Get the length of the longest line to pad each line to be the same length
        const maxLineChars = lines.reduce((acc, curr) => Math.max(acc, curr.length), 0)
        // Get the number of leading whitespaces that can be removed to hide unnecessary indentation
        const minLeadingWhitespaces = lines.reduce((acc, curr) => {
            const numWhitespaces = curr.slice(1).search(/\S/)
            if (numWhitespaces < 0) {
                return acc
            }
            return Math.min(acc, numWhitespaces)
        }, maxLineChars)
        const paddedLines = lines.map((line, i) => {
            const paddedLine = line.padEnd(maxLineChars + 2)
            if (minLeadingWhitespaces > 1) {
                return paddedLine[0] + paddedLine.slice(minLeadingWhitespaces)
            }
            return paddedLine
        })

        // Group the lines into sections so consecutive lines of the same type can be placed in
        // the same span below
        const sections = [paddedLines[0]]
        let i = 1
        while (i < paddedLines.length) {
            if (paddedLines[i][0] === sections[sections.length - 1][0]) {
                sections[sections.length - 1] += '\n' + paddedLines[i]
            } else {
                sections.push(paddedLines[i])
            }
            i++
        }

        // Return each section with the correct syntax highlighting and background color
        return sections
            .map(
                section => `
<span class="codicon codicon-none" style="background-color:var(${
                    section.startsWith('-')
                        ? '--vscode-diffEditor-removedTextBackground'
                        : section.startsWith('+')
                        ? '--vscode-diffEditor-insertedTextBackground'
                        : '--vscode-textCodeBlock-background'
                });">

\`\`\`${section.startsWith('-') || section.startsWith('+') ? 'diff' : language}
${section}
\`\`\`

</span>
`
            )
            .join('<br />')
    }
}
