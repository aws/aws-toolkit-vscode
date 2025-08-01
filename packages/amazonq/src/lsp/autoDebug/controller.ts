/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger, randomUUID } from 'aws-core-vscode/shared'
import { AutoDebugLspClient } from './lsp/autoDebugLspClient'
import { mapDiagnosticSeverity } from './shared/diagnosticUtils'

export interface AutoDebugConfig {
    readonly enabled: boolean
    readonly excludedSources: string[]
    readonly severityFilter: ('error' | 'warning' | 'info' | 'hint')[]
}

export interface Problem {
    readonly uri: vscode.Uri
    readonly diagnostic: vscode.Diagnostic
    readonly severity: 'error' | 'warning' | 'info' | 'hint'
    readonly source: string
}

/**
 * Simplified controller for Amazon Q Auto Debug system.
 * Focuses on context menu and quick fix functionality without workspace-wide monitoring.
 */
export class AutoDebugController implements vscode.Disposable {
    private readonly logger = getLogger()
    private readonly lspClient: AutoDebugLspClient
    private readonly disposables: vscode.Disposable[] = []

    private config: AutoDebugConfig

    constructor(config?: Partial<AutoDebugConfig>, client?: any, encryptionKey?: Buffer) {
        this.config = {
            enabled: true,
            excludedSources: [], // No default exclusions - let users configure as needed
            severityFilter: ['error'], // Only auto-fix errors, not warnings
            ...config,
        }

        this.lspClient = new AutoDebugLspClient(client, encryptionKey)
    }

    /**
     * Sets the language client for LSP communication
     */
    public setLanguageClient(client: any): void {
        this.lspClient.setLanguageClient(client)
    }

    /**
     * Fix specific problems in the code
     */
    async fixSpecificProblems(range?: vscode.Range, diagnostics?: vscode.Diagnostic[]): Promise<void> {
        try {
            const editor = vscode.window.activeTextEditor
            if (!editor) {
                throw new Error('No active editor found')
            }

            const filePath = editor.document.uri.fsPath

            // Use provided diagnostics or get diagnostics for the range
            let targetDiagnostics = diagnostics
            if (!targetDiagnostics && range) {
                const allDiagnostics = vscode.languages.getDiagnostics(editor.document.uri)
                targetDiagnostics = allDiagnostics.filter((d) => d.range.intersection(range) !== undefined)
            }

            if (!targetDiagnostics || targetDiagnostics.length === 0) {
                return
            }

            // Convert diagnostics to problems
            const problems = targetDiagnostics.map((diagnostic) => ({
                uri: editor.document.uri,
                diagnostic,
                severity: mapDiagnosticSeverity(diagnostic.severity),
                source: diagnostic.source || 'unknown',
            }))

            // Create fix message
            const fixMessage = this.createFixMessage(filePath, problems)
            await this.sendMessageToChat(fixMessage)
        } catch (error) {
            this.logger.error('AutoDebugController: Error fixing specific problems: %s', error)
            throw error
        }
    }

    /**
     * Fix with Amazon Q - sends up to 15 error messages one time when user clicks the button
     */
    public async fixAllProblemsInFile(maxProblems: number = 15): Promise<void> {
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            void vscode.window.showWarningMessage('No active editor found')
            return
        }

        const filePath = editor.document.uri.fsPath

        try {
            // Get all diagnostics for the current file
            const allDiagnostics = vscode.languages.getDiagnostics(editor.document.uri)

            // Filter to only errors (not warnings/info) and apply source filtering
            const errorDiagnostics = allDiagnostics.filter((d) => {
                if (d.severity !== vscode.DiagnosticSeverity.Error) {
                    return false
                }
                // Apply source filtering
                if (this.config.excludedSources.length > 0 && d.source) {
                    return !this.config.excludedSources.includes(d.source)
                }
                return true
            })

            if (errorDiagnostics.length === 0) {
                return
            }

            // Take up to maxProblems errors (15 by default)
            const diagnosticsToFix = errorDiagnostics.slice(0, maxProblems)

            // Convert diagnostics to problems
            const problems = diagnosticsToFix.map((diagnostic) => ({
                uri: editor.document.uri,
                diagnostic,
                severity: mapDiagnosticSeverity(diagnostic.severity),
                source: diagnostic.source || 'unknown',
            }))

            // Create fix message
            const fixMessage = this.createFixMessage(filePath, problems)
            await this.sendMessageToChat(fixMessage)
        } catch (error) {
            this.logger.error('AutoDebugController: Error in fix process: %s', error)
        }
    }

    /**
     * Explain problems using Amazon Q
     */
    async explainProblems(range?: vscode.Range, diagnostics?: vscode.Diagnostic[]): Promise<void> {
        try {
            const editor = vscode.window.activeTextEditor
            if (!editor) {
                throw new Error('No active editor found')
            }

            const filePath = editor.document.uri.fsPath

            // Use provided diagnostics or get diagnostics for the range
            let targetDiagnostics = diagnostics
            if (!targetDiagnostics && range) {
                const allDiagnostics = vscode.languages.getDiagnostics(editor.document.uri)
                targetDiagnostics = allDiagnostics.filter((d) => d.range.intersection(range) !== undefined)
            }

            if (!targetDiagnostics || targetDiagnostics.length === 0) {
                return
            }

            // Convert diagnostics to problems
            const problems = targetDiagnostics.map((diagnostic) => ({
                uri: editor.document.uri,
                diagnostic,
                severity: mapDiagnosticSeverity(diagnostic.severity),
                source: diagnostic.source || 'unknown',
            }))

            // Create explanation message
            const explainMessage = this.createExplainMessage(filePath, problems)
            await this.sendMessageToChat(explainMessage)
        } catch (error) {
            this.logger.error('AutoDebugController: Error explaining problems: %s', error)
            throw error
        }
    }

    private createFixMessage(filePath: string, problems: Problem[]): string {
        const parts = [`Please help me fix the following errors in ${filePath}`]

        for (const problem of problems) {
            const line = problem.diagnostic.range.start.line + 1
            const column = problem.diagnostic.range.start.character + 1
            const source = problem.source !== 'unknown' ? problem.source : 'Unknown'
            parts.push(
                `ERROR: ${problem.diagnostic.message} Location: Line ${line}, Column ${column} Source: ${source}`
            )
        }

        return parts.join('\n')
    }

    private createExplainMessage(filePath: string, problems: Problem[]): string {
        const parts = [
            `Please explain the following problems in ${filePath}. DO NOT edit files. ONLY provide explanation`,
        ]

        for (const problem of problems) {
            const line = problem.diagnostic.range.start.line + 1
            const column = problem.diagnostic.range.start.character + 1
            const source = problem.source !== 'unknown' ? problem.source : 'Unknown'
            parts.push(
                `${problem.severity.toUpperCase()}: ${problem.diagnostic.message} Location: Line ${line}, Column ${column} Source: ${source}`
            )
        }

        return parts.join('\n')
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
