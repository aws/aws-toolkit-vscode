/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger/logger'
import { ErrorContextFormatter, ErrorContext } from './diagnostics/errorContext'
import { AutoDebugLspClient } from './lsp/autoDebugLspClient'
import { randomUUID } from '../../shared/crypto'
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
    readonly isNew: boolean
}

/**
 * Simplified controller for Amazon Q Auto Debug system.
 * Focuses on context menu and quick fix functionality without workspace-wide monitoring.
 */
export class AutoDebugController implements vscode.Disposable {
    private readonly logger = getLogger('amazonqLsp')
    private readonly errorFormatter: ErrorContextFormatter
    private readonly lspClient: AutoDebugLspClient
    private readonly disposables: vscode.Disposable[] = []

    private config: AutoDebugConfig

    constructor(config?: Partial<AutoDebugConfig>, client?: any, encryptionKey?: Buffer) {
        this.config = {
            enabled: true,
            excludedSources: ['spell-checker'], // Common sources to exclude
            severityFilter: ['error'], // Only auto-fix errors, not warnings
            ...config,
        }

        this.errorFormatter = new ErrorContextFormatter()
        this.lspClient = new AutoDebugLspClient(client, encryptionKey)
    }

    /**
     * Creates formatted error contexts for AI debugging
     */
    public async createErrorContexts(problems: Problem[]): Promise<ErrorContext[]> {
        const contexts: ErrorContext[] = []

        for (const problem of problems) {
            try {
                const context = await this.errorFormatter.createErrorContext(problem)
                contexts.push(context)
            } catch (error) {
                this.logger.warn('AutoDebugController: Failed to create context for problem: %s', error)
            }
        }
        return contexts
    }

    /**
     * Formats problems for display or AI consumption
     */
    public formatProblemsForChat(problems: Problem[]): string {
        const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd()
        return this.errorFormatter.formatProblemsString(problems, cwd)
    }

    /**
     * Gets the current configuration
     */
    public getConfig(): AutoDebugConfig {
        return this.config
    }

    /**
     * Updates the configuration
     */
    public updateConfig(newConfig: Partial<AutoDebugConfig>): void {
        this.config = { ...this.config, ...newConfig }
    }

    /**
     * Sets the language client for LSP communication
     */
    public setLanguageClient(client: any): void {
        this.lspClient.setLanguageClient(client)
    }

    /**
     * Sends a chat message through the LSP client (public interface)
     */
    public async sendChatMessage(message: string, source: string): Promise<void> {
        await this.sendMessageToChat(message)
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
        const fileName = editor.document.fileName

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
                void vscode.window.showInformationMessage(`✅ No errors found in ${fileName}`)
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
                isNew: false,
            }))

            // Create fix message
            const fixMessage = this.createFixMessage(filePath, problems)
            await this.sendChatMessage(fixMessage, 'singleFix')
        } catch (error) {
            this.logger.error('AutoDebugController: Error in fix process: %s', error)
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
        this.logger.debug('AutoDebugController: Disposing auto debug controller')
        vscode.Disposable.from(...this.disposables).dispose()
    }
}
