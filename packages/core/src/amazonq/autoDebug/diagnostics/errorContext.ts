/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as path from 'path'
import { getLogger } from '../../../shared/logger/logger'
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
    private readonly logger = getLogger('amazonqLsp')

    constructor() {
        this.logger.debug('ErrorContextFormatter: Initializing error context formatter')
    }

    /**
     * Converts a Problem to detailed ErrorContext
     */
    public async createErrorContext(problem: Problem): Promise<ErrorContext> {
        this.logger.debug(
            'ErrorContextFormatter: Creating error context for %s at line %d',
            problem.uri.fsPath,
            problem.diagnostic.range.start.line + 1
        )

        const surroundingCode = await this.extractSurroundingCode(problem.uri, problem.diagnostic.range)

        const context: ErrorContext = {
            source: problem.source,
            severity: problem.severity,
            location: {
                file: path.relative(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '', problem.uri.fsPath),
                line: problem.diagnostic.range.start.line + 1, // Convert from 0-indexed
                column: problem.diagnostic.range.start.character + 1, // Convert from 0-indexed
                range: problem.diagnostic.range,
            },
            message: problem.diagnostic.message,
            code: problem.diagnostic.code?.toString(),
            relatedInformation: problem.diagnostic.relatedInformation,
            surroundingCode,
        }

        this.logger.debug('ErrorContextFormatter: Created error context for %s', context.location.file)
        return context
    }

    /**
     * Formats multiple error contexts into a comprehensive report
     */
    public formatErrorReport(contexts: ErrorContext[]): FormattedErrorReport {
        this.logger.debug('ErrorContextFormatter: Formatting error report for %d contexts', contexts.length)

        const summary = this.createSummary(contexts)
        const details = this.createDetails(contexts)
        const contextualCode = this.createContextualCode(contexts)
        const suggestions = this.createSuggestions(contexts)

        return {
            summary,
            details,
            contextualCode,
            suggestions,
        }
    }

    /**
     * Formats a single error context for display
     */
    public formatSingleError(context: ErrorContext): string {
        this.logger.debug('ErrorContextFormatter: Formatting single error for %s', context.location.file)

        const parts = [
            `**${context.severity.toUpperCase()}** in ${context.location.file}`,
            `Line ${context.location.line}, Column ${context.location.column}`,
            `Source: ${context.source}`,
            context.code ? `Code: ${context.code}` : undefined,
            '',
            `**Message:** ${context.message}`,
            '',
        ].filter(Boolean)

        if (context.surroundingCode) {
            parts.push('**Code Context:**')
            parts.push('```typescript')
            parts.push(context.surroundingCode)
            parts.push('```')
            parts.push('')
        }

        if (context.relatedInformation && context.relatedInformation.length > 0) {
            parts.push('**Related Information:**')
            for (const info of context.relatedInformation) {
                const relativeFile = path.relative(
                    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',
                    info.location.uri.fsPath
                )
                parts.push(`- ${relativeFile}:${info.location.range.start.line + 1} - ${info.message}`)
            }
            parts.push('')
        }

        return parts.join('\n')
    }

    /**
     * Creates a problems string similar to the reference implementation
     */
    public formatProblemsString(problems: Problem[], cwd: string): string {
        this.logger.debug('ErrorContextFormatter: Formatting problems string for %d problems', problems.length)

        let result = ''
        const fileGroups = this.groupProblemsByFile(problems)

        for (const [filePath, fileProblems] of fileGroups.entries()) {
            if (fileProblems.length > 0) {
                result += `\n\n${path.relative(cwd, filePath)}`

                for (const problem of fileProblems) {
                    const label = this.getSeverityLabel(problem.severity)
                    const line = problem.diagnostic.range.start.line + 1
                    const source = problem.source ? `${problem.source} ` : ''
                    result += `\n- [${source}${label}] Line ${line}: ${problem.diagnostic.message}`
                }
            }
        }

        return result.trim()
    }

    /**
     * Extracts code context around a diagnostic range
     */
    private async extractSurroundingCode(uri: vscode.Uri, range: vscode.Range): Promise<string | undefined> {
        try {
            const document = await vscode.workspace.openTextDocument(uri)
            const startLine = Math.max(0, range.start.line - 3)
            const endLine = Math.min(document.lineCount - 1, range.end.line + 3)

            const lines: string[] = []
            for (let i = startLine; i <= endLine; i++) {
                const lineText = document.lineAt(i).text
                const lineNumber = (i + 1).toString().padStart(3, ' ')
                const marker = i >= range.start.line && i <= range.end.line ? '>' : ' '
                lines.push(`${lineNumber}${marker} ${lineText}`)
            }

            return lines.join('\n')
        } catch (error) {
            this.logger.warn('ErrorContextFormatter: Failed to extract surrounding code: %s', error)
            return undefined
        }
    }

    private createSummary(contexts: ErrorContext[]): string {
        const errorCount = contexts.filter((c) => c.severity === 'error').length
        const warningCount = contexts.filter((c) => c.severity === 'warning').length

        const parts = []
        if (errorCount > 0) {
            parts.push(`${errorCount} error${errorCount !== 1 ? 's' : ''}`)
        }
        if (warningCount > 0) {
            parts.push(`${warningCount} warning${warningCount !== 1 ? 's' : ''}`)
        }

        return `Found ${parts.join(' and ')} in your code`
    }

    private createDetails(contexts: ErrorContext[]): string {
        return contexts.map((context) => this.formatSingleError(context)).join('\n---\n\n')
    }

    private createContextualCode(contexts: ErrorContext[]): string {
        const codeBlocks = contexts
            .filter((context) => context.surroundingCode)
            .map((context) => `**${context.location.file}:**\n\`\`\`typescript\n${context.surroundingCode}\n\`\`\``)

        return codeBlocks.join('\n\n')
    }

    private createSuggestions(contexts: ErrorContext[]): string {
        const suggestions = []

        // Group by error type for better suggestions
        const errorTypes = new Map<string, ErrorContext[]>()
        for (const context of contexts) {
            const key = context.source || 'unknown'
            if (!errorTypes.has(key)) {
                errorTypes.set(key, [])
            }
            errorTypes.get(key)!.push(context)
        }

        for (const [source, sourceContexts] of errorTypes) {
            suggestions.push(`**${source} Issues (${sourceContexts.length}):**`)
            suggestions.push(this.generateSourceSpecificSuggestions(source, sourceContexts))
        }

        return suggestions.join('\n\n')
    }

    private generateSourceSpecificSuggestions(source: string, contexts: ErrorContext[]): string {
        // Basic suggestions based on common error patterns
        const suggestions = []

        if (source.includes('typescript') || source.includes('ts')) {
            suggestions.push('- Check type definitions and imports')
            suggestions.push('- Verify function signatures and return types')
        }

        if (source.includes('eslint')) {
            suggestions.push('- Review code style and formatting')
            suggestions.push('- Check for unused variables and imports')
        }

        if (contexts.some((c) => c.message.includes('Cannot find module'))) {
            suggestions.push('- Verify module installation: npm install or yarn install')
            suggestions.push('- Check import paths and module names')
        }

        if (contexts.some((c) => c.message.includes('is not assignable'))) {
            suggestions.push('- Review type compatibility')
            suggestions.push('- Consider type assertions or interface updates')
        }

        return suggestions.length > 0 ? suggestions.join('\n') : '- Review the specific error messages above'
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

    private getSeverityLabel(severity: string): string {
        switch (severity) {
            case 'error':
                return 'ERROR'
            case 'warning':
                return 'WARN'
            case 'info':
                return 'INFO'
            case 'hint':
                return 'HINT'
            default:
                return 'UNKNOWN'
        }
    }
}
