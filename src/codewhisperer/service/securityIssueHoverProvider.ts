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
        // Add some padding so that each line has the same number of chars
        const lines = code.split('\n')
        const maxLineChars = lines.reduce((acc, curr) => Math.max(acc, curr.length), 0)
        const paddedCode = lines.map(line => line.padEnd(maxLineChars + 2)).join('\n')

        // Split the code into sections of prefix, deletion, addition, suffix which will show
        // up in that order. However, since a code diff might only have deletion or addition and
        // not both, we need some additional checks to ensure our substrings are grouped properly.
        const deletionIndex = paddedCode.indexOf('\n-')
        const additionIndex = paddedCode.indexOf('\n+')
        let prefix = ''
        let deletion = ''
        let addition = ''
        let suffix = ''
        if (deletionIndex) {
            prefix = paddedCode.substring(0, deletionIndex)
            if (additionIndex) {
                // Found both deletion and addition
                deletion = paddedCode.substring(deletionIndex + 1, additionIndex)
                const suffixIndex = paddedCode.indexOf('\n', paddedCode.lastIndexOf('\n+') + 1)
                addition = paddedCode.substring(additionIndex + 1, suffixIndex)
                suffix = paddedCode.substring(suffixIndex + 1)
            } else {
                // Found only deletion and no addition
                deletion = paddedCode.substring(
                    deletionIndex + 1,
                    paddedCode.indexOf('\n', paddedCode.lastIndexOf('\n-') + 1)
                )
                const suffixIndex = paddedCode.indexOf('\n', paddedCode.lastIndexOf('\n-') + 1)
                suffix = paddedCode.substring(suffixIndex + 1)
            }
        } else {
            // No deletions, so there must only be additions
            prefix = paddedCode.substring(0, additionIndex)
            const suffixIndex = paddedCode.indexOf('\n', paddedCode.lastIndexOf('\n+') + 1)
            addition = paddedCode.substring(additionIndex + 1, suffixIndex)
            suffix = paddedCode.substring(suffixIndex + 1)
        }

        // Return each section with the correct syntax highlighting and background color
        return [prefix, deletion, addition, suffix]
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

</span>`
            )
            .join('')
    }
}
