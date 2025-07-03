/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../../shared/logger/logger'
import { Commands } from '../../../shared/vscode/commands2'
import { AutoDebugController } from '../autoDebugController'
import { focusAmazonQPanel } from '../../../codewhispererChat/commands/registerCommands'
import { placeholder } from '../../../shared/vscode/commands2'
import { mapDiagnosticSeverity, getDiagnosticsForRange } from '../shared/diagnosticUtils'

/**
 * Provides context menu integration for Amazon Q Auto Debug features.
 */
export class ContextMenuProvider implements vscode.Disposable {
    private readonly logger = getLogger('amazonqLsp')
    private readonly disposables: vscode.Disposable[] = []

    constructor(private readonly autoDebugController: AutoDebugController) {
        this.logger.debug('ContextMenuProvider: Initializing context menu provider')
        this.registerCommands()
    }

    private registerCommands(): void {
        this.logger.debug('ContextMenuProvider: Registering context menu commands')

        // Register "Add to Amazon Q" command
        this.disposables.push(
            Commands.register(
                {
                    id: 'amazonq.autoDebug.addToChat',
                    name: 'Add Code with Diagnostics to Amazon Q',
                    telemetryName: 'amazonq_openChat',
                },
                async (range?: vscode.Range, diagnostics?: vscode.Diagnostic[]) => {
                    await this.addToAmazonQ(range, diagnostics)
                }
            )
        )

        // Register "Fix with Amazon Q" command
        this.disposables.push(
            Commands.register(
                {
                    id: 'amazonq.autoDebug.fixWithQ',
                    name: 'Fix with Amazon Q',
                    telemetryName: 'amazonq_openChat',
                },
                async (range?: vscode.Range, diagnostics?: vscode.Diagnostic[]) => {
                    await this.fixWithAmazonQ(range, diagnostics)
                }
            )
        )

        // Register "Explain Problem" command
        this.disposables.push(
            Commands.register(
                {
                    id: 'amazonq.autoDebug.explainProblem',
                    name: 'Explain Problem with Amazon Q',
                    telemetryName: 'amazonq_openChat',
                },
                async (range?: vscode.Range, diagnostics?: vscode.Diagnostic[]) => {
                    await this.explainProblem(range, diagnostics)
                }
            )
        )

        // Register "Start Auto Debug Session" command
        this.disposables.push(
            Commands.register(
                {
                    id: 'amazonq.autoDebug.startSession',
                    name: 'Start Auto Debug Session',
                    telemetryName: 'vscode_executeCommand',
                },
                async () => {
                    await this.startAutoDebugSession()
                }
            )
        )

        // Register "End Auto Debug Session" command
        this.disposables.push(
            Commands.register(
                {
                    id: 'amazonq.autoDebug.endSession',
                    name: 'End Auto Debug Session',
                    telemetryName: 'vscode_executeCommand',
                },
                async () => {
                    await this.endAutoDebugSession()
                }
            )
        )
    }

    /**
     * Adds selected code with diagnostic context to Amazon Q chat
     * **Fixed to use working LSP integration like AutoDebug flow**
     */
    private async addToAmazonQ(range?: vscode.Range, diagnostics?: vscode.Diagnostic[]): Promise<void> {
        this.logger.debug('ContextMenuProvider: Adding code to Amazon Q chat')

        try {
            const editor = vscode.window.activeTextEditor
            if (!editor) {
                this.logger.warn('ContextMenuProvider: No active editor for addToAmazonQ')
                return
            }

            const selectedText = this.getSelectedText(editor, range)
            const filePath = editor.document.uri.fsPath
            const languageId = editor.document.languageId

            // Use shared helper to get diagnostics and convert to problems
            const problems = this.getDiagnosticsAsProblems(editor, range, diagnostics) || []

            // Format the context for chat
            const formattedProblems = this.autoDebugController.formatProblemsForChat(problems)
            const contextMessage = this.createChatMessage(selectedText, filePath, languageId, formattedProblems)

            // **FIXED: Use working AutoDebugController LSP integration instead of broken webview approach**
            await focusAmazonQPanel.execute(placeholder, 'autoDebug')
            await this.autoDebugController.sendChatMessage(contextMessage, 'addToChat')

            this.logger.debug('ContextMenuProvider: Successfully added code to Amazon Q chat using LSP integration')
        } catch (error) {
            this.logger.error('ContextMenuProvider: Error adding code to Amazon Q: %s', error)
            void vscode.window.showErrorMessage('Failed to add code to Amazon Q chat')
        }
    }

    /**
     * Enhanced Fix with Amazon Q - processes all errors in the file iteratively
     */
    private async fixWithAmazonQ(range?: vscode.Range, diagnostics?: vscode.Diagnostic[]): Promise<void> {
        this.logger.debug('ContextMenuProvider: Starting enhanced Fix with Amazon Q')

        try {
            const editor = vscode.window.activeTextEditor
            if (!editor) {
                this.logger.warn('ContextMenuProvider: No active editor for fixWithAmazonQ')
                void vscode.window.showWarningMessage('No active editor found')
                return
            }

            // If specific range/diagnostics provided, use focused fix
            if (range || diagnostics) {
                await this.fixSpecificProblems(range, diagnostics)
            } else {
                // Use the enhanced fix-all-problems method
                this.logger.debug('ContextMenuProvider: Using enhanced fix-all-problems method')
                await this.autoDebugController.fixAllProblemsInFile(10) // 10 errors per batch
            }

            this.logger.debug('ContextMenuProvider: Successfully completed enhanced fix with Amazon Q')
        } catch (error) {
            this.logger.error('ContextMenuProvider: Error in enhanced fix with Amazon Q: %s', error)
            void vscode.window.showErrorMessage(
                `Enhanced fix failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            )
        }
    }

    /**
     * Fixes specific problems when range or diagnostics are provided
     */
    private async fixSpecificProblems(range?: vscode.Range, diagnostics?: vscode.Diagnostic[]): Promise<void> {
        const editor = vscode.window.activeTextEditor!
        const selectedText = this.getSelectedText(editor, range)
        const filePath = editor.document.uri.fsPath
        const languageId = editor.document.languageId

        // Use shared helper to get diagnostics and convert to problems
        const problems = this.getDiagnosticsAsProblems(
            editor,
            range,
            diagnostics,
            'No problems found in the selected code'
        )

        if (!problems) {
            return
        }

        // Create focused fix message for specific problems
        const errorContexts = await this.autoDebugController.createErrorContexts(problems)
        const fixMessage = this.createFixMessage(selectedText, filePath, languageId, errorContexts)

        // Use the working AutoDebugController pipeline
        await this.autoDebugController.sendChatMessage(fixMessage, 'focusedFix')

        this.logger.debug('ContextMenuProvider: Successfully sent focused fix request')
    }

    /**
     * Explains the problem using Amazon Q
     * **Fixed to use working LSP integration like AutoDebug flow**
     */
    private async explainProblem(range?: vscode.Range, diagnostics?: vscode.Diagnostic[]): Promise<void> {
        this.logger.debug('ContextMenuProvider: Explaining problem with Amazon Q')

        try {
            const editor = vscode.window.activeTextEditor
            if (!editor) {
                this.logger.warn('ContextMenuProvider: No active editor for explainProblem')
                return
            }

            // Use shared helper to get diagnostics and convert to problems
            const problems = this.getDiagnosticsAsProblems(
                editor,
                range,
                diagnostics,
                'No problems found at the current location'
            )

            if (!problems) {
                return
            }

            // Create explanation message
            const explanationMessage = this.createExplanationMessage(problems)

            // **FIXED: Use working AutoDebugController LSP integration instead of broken webview approach**
            await focusAmazonQPanel.execute(placeholder, 'autoDebug')
            await this.autoDebugController.sendChatMessage(explanationMessage, 'explainProblem')

            this.logger.debug('ContextMenuProvider: Successfully requested problem explanation using LSP integration')
        } catch (error) {
            this.logger.error('ContextMenuProvider: Error explaining problem: %s', error)
            void vscode.window.showErrorMessage('Failed to explain problem with Amazon Q')
        }
    }

    /**
     * Starts a new auto debug session
     */
    private async startAutoDebugSession(): Promise<void> {
        this.logger.debug('ContextMenuProvider: Starting auto debug session')

        try {
            const session = await this.autoDebugController.startSession()
            void vscode.window.showInformationMessage(
                `Auto Debug session started (ID: ${session.id.substring(0, 8)}...)`
            )
            this.logger.debug('ContextMenuProvider: Auto debug session started successfully')
        } catch (error) {
            this.logger.error('ContextMenuProvider: Error starting auto debug session: %s', error)
            void vscode.window.showErrorMessage('Failed to start Auto Debug session')
        }
    }

    /**
     * Ends the current auto debug session
     */
    private async endAutoDebugSession(): Promise<void> {
        this.logger.debug('ContextMenuProvider: Ending auto debug session')

        try {
            await this.autoDebugController.endSession()
            void vscode.window.showInformationMessage('Auto Debug session ended')
            this.logger.debug('ContextMenuProvider: Auto debug session ended successfully')
        } catch (error) {
            this.logger.error('ContextMenuProvider: Error ending auto debug session: %s', error)
            void vscode.window.showErrorMessage('Failed to end Auto Debug session')
        }
    }

    private getSelectedText(editor: vscode.TextEditor, range?: vscode.Range): string {
        if (range) {
            return editor.document.getText(range)
        }

        const selection = editor.selection
        if (!selection.isEmpty) {
            return editor.document.getText(selection)
        }

        // If no selection, get the current line
        const currentLine = editor.document.lineAt(editor.selection.active.line)
        return currentLine.text
    }

    /**
     * Shared helper to get diagnostics and convert them to problems
     */
    private getDiagnosticsAsProblems(
        editor: vscode.TextEditor,
        range?: vscode.Range,
        diagnostics?: vscode.Diagnostic[],
        noProblemsMessage?: string
    ): any[] | undefined {
        // Get diagnostics for the current location if not provided
        const contextDiagnostics = diagnostics || getDiagnosticsForRange(editor.document.uri, range)

        if (contextDiagnostics.length === 0) {
            if (noProblemsMessage) {
                void vscode.window.showInformationMessage(noProblemsMessage)
            }
            return undefined
        }

        // Convert diagnostics to problems
        return contextDiagnostics.map((diagnostic) => ({
            uri: editor.document.uri,
            diagnostic,
            severity: mapDiagnosticSeverity(diagnostic.severity),
            source: diagnostic.source || 'unknown',
            isNew: false,
        }))
    }

    private createChatMessage(selectedText: string, filePath: string, languageId: string, problems: string): string {
        const parts = [
            'I need help with this code that has some issues:',
            '',
            `**File:** ${filePath}`,
            `**Language:** ${languageId}`,
            '',
            '**Code:**',
            `\`\`\`${languageId}`,
            selectedText,
            '```',
            '',
        ]

        if (problems.trim()) {
            parts.push('**Problems detected:**')
            parts.push(problems)
        }

        return parts.join('\n')
    }

    private createFixMessage(selectedText: string, filePath: string, languageId: string, errorContexts: any[]): string {
        const parts = [
            'Please help me fix the following code issues:',
            '',
            `**File:** ${filePath}`,
            `**Language:** ${languageId}`,
            '',
            '**Code:**',
            `\`\`\`${languageId}`,
            selectedText,
            '```',
            '',
            '**Issues to fix:**',
        ]

        for (const context of errorContexts) {
            parts.push(`- **${context.severity.toUpperCase()}**: ${context.message}`)
            if (context.location) {
                parts.push(`  Location: Line ${context.location.line}, Column ${context.location.column}`)
            }
        }

        parts.push('')
        parts.push('Please fix the error in place in the file.')

        return parts.join('\n')
    }

    private createExplanationMessage(problems: any[]): string {
        const parts = ['Can you explain these code problems and suggest how to fix them?', '']

        for (const problem of problems) {
            parts.push(`**${problem.severity.toUpperCase()}**: ${problem.diagnostic.message}`)
            parts.push(`Source: ${problem.source}`)
            parts.push(`Location: Line ${problem.diagnostic.range.start.line + 1}`)
            parts.push('')
        }

        return parts.join('\n')
    }

    public dispose(): void {
        this.logger.debug('ContextMenuProvider: Disposing context menu provider')
        vscode.Disposable.from(...this.disposables).dispose()
    }
}
