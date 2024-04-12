/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { CodeScanIssue } from '../models/model'
import globals from '../../shared/extensionGlobals'
import { SecurityIssueProvider } from './securityIssueProvider'
import { Component, telemetry } from '../../shared/telemetry/telemetry'
import path from 'path'
import { AuthUtil } from '../util/authUtil'
import { TelemetryHelper } from '../util/telemetryHelper'

export class SecurityIssueHoverProvider extends SecurityIssueProvider implements vscode.HoverProvider {
    static #instance: SecurityIssueHoverProvider

    public static get instance() {
        return (this.#instance ??= new this())
    }

    public provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken
    ): vscode.Hover {
        const contents: vscode.MarkdownString[] = []

        for (const group of this.issues) {
            if (document.fileName !== group.filePath) {
                continue
            }

            for (const issue of group.issues) {
                const range = new vscode.Range(issue.startLine, 0, issue.endLine, 0)
                if (range.contains(position)) {
                    contents.push(this._getContent(group.filePath, issue))
                    telemetry.codewhisperer_codeScanIssueHover.emit({
                        findingId: issue.findingId,
                        detectorId: issue.detectorId,
                        ruleId: issue.ruleId,
                        includesFix: !!issue.suggestedFixes.length,
                        credentialStartUrl: AuthUtil.instance.startUrl,
                    })
                    TelemetryHelper.instance.sendCodeScanRemediationsEvent(
                        document.languageId,
                        'CODESCAN_ISSUE_HOVER',
                        issue.detectorId,
                        issue.findingId,
                        issue.ruleId,
                        undefined,
                        undefined,
                        undefined,
                        !!issue.suggestedFixes.length
                    )
                }
            }
        }

        return new vscode.Hover(contents)
    }

    private _getContent(filePath: string, issue: CodeScanIssue) {
        const markdownString = new vscode.MarkdownString()
        markdownString.isTrusted = true
        markdownString.supportHtml = true
        markdownString.supportThemeIcons = true
        markdownString.baseUri = vscode.Uri.file(path.join(globals.context.extensionPath, 'resources/images/'))

        const [suggestedFix] = issue.suggestedFixes

        markdownString.appendMarkdown(`## ${issue.title} ${this._makeSeverityBadge(issue.severity)}\n`)
        markdownString.appendMarkdown(`${suggestedFix ? suggestedFix.description : issue.recommendation.text}\n\n`)

        const args = [issue, filePath]
        const viewDetailsCommand = vscode.Uri.parse(
            `command:aws.amazonq.openSecurityIssuePanel?${encodeURIComponent(JSON.stringify(args))}`
        )

        markdownString.appendMarkdown(
            `[$(eye) View Details](${viewDetailsCommand} 'Open "CodeWhisperer Security Issue"')\n`
        )

        if (suggestedFix) {
            const args: [CodeScanIssue, string, Component] = [issue, filePath, 'hover']
            const applyFixCommand = vscode.Uri.parse(
                `command:aws.amazonq.applySecurityFix?${encodeURIComponent(JSON.stringify(args))}`
            )
            markdownString.appendMarkdown(` | [$(wrench) Apply Fix](${applyFixCommand} "Apply suggested fix")\n`)
            markdownString.appendMarkdown('### Suggested Fix Preview\n')
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
        return `![${severity}](severity-${severity.toLowerCase()}.svg)`
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
        const lines = code.replaceAll('\n\\ No newline at end of file', '').split('\n')
        const maxLineChars = lines.reduce((acc, curr) => Math.max(acc, curr.length), 0)
        const paddedLines = lines.map(line => line.padEnd(maxLineChars + 2))

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
                        : section.startsWith('@@')
                        ? '--vscode-editorMarkerNavigationInfo-headerBackground'
                        : '--vscode-diffEditor-unchangedCodeBackground'
                });">

\`\`\`${section.startsWith('-') || section.startsWith('+') ? 'diff' : section.startsWith('@@') ? undefined : language}
${section}
\`\`\`

</span>
`
            )
            .join('<br />')
    }
}
