/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { Problem } from './problemDetector'

export interface ErrorContext {
    readonly source: string
    readonly severity: 'error' | 'warning' | 'info' | 'hint'
    readonly location: {
        readonly file: string
        readonly line: number
        readonly column: number
        readonly range?: vscode.Range
    }
    readonly message: string
    readonly code?: string | number
    readonly relatedInformation?: vscode.DiagnosticRelatedInformation[]
    readonly suggestedFixes?: vscode.CodeAction[]
    readonly surroundingCode?: string
}

export interface FormattedErrorReport {
    readonly summary: string
    readonly details: string
    readonly contextualCode: string
    readonly suggestions: string
}

/**
 * Formats diagnostic errors into contextual information for AI debugging assistance.
 */
export class ErrorContextFormatter {
    /**
     * Creates a problems string with Markdown formatting for better readability
     */
    public formatProblemsString(problems: Problem[], cwd: string): string {
        let result = ''
        const fileGroups = this.groupProblemsByFile(problems)

        for (const [filePath, fileProblems] of fileGroups.entries()) {
            if (fileProblems.length > 0) {
                result += `\n\n**${path.relative(cwd, filePath)}**\n\n`

                // Group problems into a code block for better formatting
                result += '```\n'
                for (const problem of fileProblems) {
                    const line = problem.diagnostic.range.start.line + 1
                    const source = problem.source ? `${problem.source}` : 'Unknown'
                    result += `[${source}] Line ${line}: ${problem.diagnostic.message}\n`
                }
                result += '```'
            }
        }

        return result.trim()
    }

    private groupProblemsByFile(problems: Problem[]): Map<string, Problem[]> {
        const groups = new Map<string, Problem[]>()

        for (const problem of problems) {
            const filePath = problem.uri.fsPath
            if (!groups.has(filePath)) {
                groups.set(filePath, [])
            }
            groups.get(filePath)!.push(problem)
        }

        return groups
    }
}
