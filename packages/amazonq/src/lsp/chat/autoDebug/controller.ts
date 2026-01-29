/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger, randomUUID, messages } from 'aws-core-vscode/shared'
import { AutoDebugLspClient } from './lsp/autoDebugLspClient'
import { mapDiagnosticSeverity } from './shared/diagnosticUtils'
import { ErrorContextFormatter } from './diagnostics/errorContext'
import { Problem } from './diagnostics/problemDetector'
export interface AutoDebugConfig {
    readonly enabled: boolean
    readonly excludedSources: string[]
    readonly severityFilter: ('error' | 'warning' | 'info' | 'hint')[]
}

/**
 * Simplified controller for Amazon Q Auto Debug system.
 * Focuses on context menu and quick fix functionality without workspace-wide monitoring.
 */
export class AutoDebugController implements vscode.Disposable {
    private readonly logger = getLogger()
    private readonly lspClient: AutoDebugLspClient
    private readonly errorFormatter: ErrorContextFormatter
    private readonly disposables: vscode.Disposable[] = []

    private config: AutoDebugConfig

    constructor(config?: Partial<AutoDebugConfig>) {
        this.config = {
            enabled: true,
            excludedSources: [], // No default exclusions - let users configure as needed
            severityFilter: ['error'], // Only auto-fix errors, not warnings
            ...config,
        }

        this.lspClient = new AutoDebugLspClient()
        this.errorFormatter = new ErrorContextFormatter()
    }

    /**
     * Extract common logic for getting problems from diagnostics
     */
    private async getProblemsFromDiagnostics(
        range?: vscode.Range,
        diagnostics?: vscode.Diagnostic[]
    ): Promise<{ editor: vscode.TextEditor; problems: Problem[] } | undefined> {
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            throw new Error('No active editor found')
        }

        // Use provided diagnostics or get diagnostics for the range
        let targetDiagnostics = diagnostics
        if (!targetDiagnostics && range) {
            const allDiagnostics = vscode.languages.getDiagnostics(editor.document.uri)
            targetDiagnostics = allDiagnostics.filter((d) => d.range.intersection(range) !== undefined)
        }

        if (!targetDiagnostics || targetDiagnostics.length === 0) {
            return undefined
        }

        // Convert diagnostics to problems
        const problems = targetDiagnostics.map((diagnostic) => ({
            uri: editor.document.uri,
            diagnostic,
            severity: mapDiagnosticSeverity(diagnostic.severity),
            source: diagnostic.source || 'unknown',
            isNew: false,
        }))

        return { editor, problems }
    }

    /**
     * Filter diagnostics by severity and apply source filtering
     */
    private filterDiagnostics(diagnostics: vscode.Diagnostic[], includeWarnings: boolean = false): vscode.Diagnostic[] {
        return diagnostics.filter((d) => {
            // Filter by severity: errors always, warnings only if includeWarnings
            const isError = d.severity === vscode.DiagnosticSeverity.Error
            const isWarning = d.severity === vscode.DiagnosticSeverity.Warning
            if (!isError && !(includeWarnings && isWarning)) {
                return false
            }
            // Apply source filtering
            if (this.config.excludedSources.length > 0 && d.source) {
                return !this.config.excludedSources.includes(d.source)
            }
            return true
        })
    }

    /**
     * Fix specific problems in the code
     */
    async fixSpecificProblems(range?: vscode.Range, diagnostics?: vscode.Diagnostic[]): Promise<void> {
        try {
            const result = await this.getProblemsFromDiagnostics(range, diagnostics)
            if (!result) {
                return
            }
            const fixMessage = this.createFixMessage(result.editor.document.uri.fsPath, result.problems)
            await this.sendMessageToChat(fixMessage)
        } catch (error) {
            this.logger.error('AutoDebugController: Error fixing specific problems: %s', error)
            throw error
        }
    }

    /**
     * Fix with Amazon Q - sends up to maxProblems issues when user clicks the button
     * @param includeWarnings - if true, fix both errors and warnings; if false, fix only errors
     * @param maxProblems - maximum number of problems to fix (default 10)
     */
    public async fixAllProblemsInFile(includeWarnings: boolean = false, maxProblems: number = 10): Promise<number> {
        try {
            const editor = vscode.window.activeTextEditor
            if (!editor) {
                void messages.showMessage('warn', 'No active editor found')
                return 0
            }

            // Get all diagnostics for the current file
            const allDiagnostics = vscode.languages.getDiagnostics(editor.document.uri)
            const filteredDiagnostics = this.filterDiagnostics(allDiagnostics, includeWarnings)
            if (filteredDiagnostics.length === 0) {
                return 0
            }

            // Take up to maxProblems
            const diagnosticsToFix = filteredDiagnostics.slice(0, maxProblems)
            const result = await this.getProblemsFromDiagnostics(undefined, diagnosticsToFix)
            if (!result) {
                return 0
            }

            const fixMessage = this.createFixMessage(result.editor.document.uri.fsPath, result.problems)
            await this.sendMessageToChat(fixMessage)
            return result.problems.length
        } catch (error) {
            this.logger.error('AutoDebugController: Error in fix process: %s', error)
            throw error
        }
    }

    /**
     * Explain problems using Amazon Q
     */
    async explainProblems(range?: vscode.Range, diagnostics?: vscode.Diagnostic[]): Promise<void> {
        try {
            const result = await this.getProblemsFromDiagnostics(range, diagnostics)
            if (!result) {
                return
            }
            const explainMessage = this.createExplainMessage(result.editor.document.uri.fsPath, result.problems)
            await this.sendMessageToChat(explainMessage)
        } catch (error) {
            this.logger.error('AutoDebugController: Error explaining problems: %s', error)
            throw error
        }
    }

    private createFixMessage(filePath: string, problems: Problem[]): string {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || ''
        const formattedProblems = this.errorFormatter.formatProblemsString(problems, workspaceRoot)

        return `Please help me fix the following errors in ${filePath}:${formattedProblems}`
    }

    private createExplainMessage(filePath: string, problems: Problem[]): string {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || ''
        const formattedProblems = this.errorFormatter.formatProblemsString(problems, workspaceRoot)

        return `Please explain the following problems in ${filePath}. DO NOT edit files. ONLY provide explanation:${formattedProblems}`
    }

    /**
     * Sends message directly to language server bypassing webview connectors
     * This ensures messages go through the proper LSP chat system
     */
    private async sendMessageToChat(message: string): Promise<void> {
        const triggerID = randomUUID()
        try {
            const success = await this.lspClient.sendChatMessage({
                message: message,
                triggerType: 'autoDebug',
                eventId: triggerID,
            })

            if (success) {
                this.logger.debug('AutoDebugController: Chat message sent successfully through LSP client')
            } else {
                this.logger.error('AutoDebugController: Failed to send chat message through LSP client')
                throw new Error('Failed to send message through LSP client')
            }
        } catch (error) {
            this.logger.error(
                'AutoDebugController: Error sending message through LSP client with triggerID %s: %s',
                triggerID,
                error
            )
        }
    }

    public dispose(): void {
        vscode.Disposable.from(...this.disposables).dispose()
    }
}
