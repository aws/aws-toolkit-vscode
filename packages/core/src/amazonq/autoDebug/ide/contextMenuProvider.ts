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
        this.registerCommands()
    }

    private registerCommands(): void {
        // Register "Fix with Amazon Q" command
        this.disposables.push(
            Commands.register(
                {
                    id: 'amazonq.01.fixWithQ',
                    name: 'Fix with Amazon Q',
                    telemetryName: 'amazonq_openChat',
                },
                async (range?: vscode.Range, diagnostics?: vscode.Diagnostic[]) => {
                    await this.fixWithAmazonQ(range, diagnostics)
                }
            )
        )

        // Register "Fix All with Amazon Q" command
        this.disposables.push(
            Commands.register(
                {
                    id: 'amazonq.02.fixAllWithQ',
                    name: 'Fix All with Amazon Q',
                    telemetryName: 'amazonq_openChat',
                },
                async () => {
                    await this.fixAllWithAmazonQ()
                }
            )
        )

        // Register "Explain Problem with Amazon Q" command
        this.disposables.push(
            Commands.register(
                {
                    id: 'amazonq.03.explainProblem',
                    name: 'Explain Problem with Amazon Q',
                    telemetryName: 'amazonq_openChat',
                },
                async (range?: vscode.Range, diagnostics?: vscode.Diagnostic[]) => {
                    await this.explainProblem(range, diagnostics)
                }
            )
        )

        // Session management commands (less frequently used, at the end)
        // Register "Start Auto Debug Session" command
        this.disposables.push(
            Commands.register(
                {
                    id: 'amazonq.05.startSession',
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
                    id: 'amazonq.06.endSession',
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
     * Fix with Amazon Q - fixes only the specific issues the user selected
     */
    private async fixWithAmazonQ(range?: vscode.Range, diagnostics?: vscode.Diagnostic[]): Promise<void> {
        try {
            const editor = vscode.window.activeTextEditor
            if (!editor) {
                this.logger.warn('ContextMenuProvider: No active editor for fixWithAmazonQ')
                void vscode.window.showWarningMessage('No active editor found')
                return
            }
            await this.fixSpecificProblems(range, diagnostics)
        } catch (error) {
            this.logger.error('ContextMenuProvider: Error in Fix with Amazon Q: %s', error)
        }
    }

    /**
     * Fix All with Amazon Q - processes all errors in the current file
     */
    private async fixAllWithAmazonQ(): Promise<void> {
        try {
            const editor = vscode.window.activeTextEditor
            if (!editor) {
                void vscode.window.showWarningMessage('No active editor found')
                return
            }

            // Focus Amazon Q panel first
            await focusAmazonQPanel.execute(placeholder, 'autoDebug')

            // Use the enhanced fix-all-problems method
            await this.autoDebugController.fixAllProblemsInFile(10) // 10 errors per batch
        } catch (error) {
            this.logger.error('ContextMenuProvider: Error in Fix All with Amazon Q: %s', error)
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
    }

    /**
     * Explains the problem using Amazon Q
     * **Fixed to use working LSP integration like AutoDebug flow**
     */
    private async explainProblem(range?: vscode.Range, diagnostics?: vscode.Diagnostic[]): Promise<void> {
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
            await focusAmazonQPanel.execute(placeholder, 'autoDebug')
            await this.autoDebugController.sendChatMessage(explanationMessage, 'explainProblem')
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
        parts.push('Please fix the error.')

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
