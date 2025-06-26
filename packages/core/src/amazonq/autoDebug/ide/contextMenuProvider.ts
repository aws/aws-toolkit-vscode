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
import { DefaultAmazonQAppInitContext } from '../../../amazonq/apps/initContext'
import { randomUUID } from '../../../shared/crypto'

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

            // Get diagnostics for the current location if not provided
            const contextDiagnostics = diagnostics || this.getDiagnosticsForRange(editor.document.uri, range)

            // Convert diagnostics to problems for formatting
            const problems = contextDiagnostics.map((diagnostic) => ({
                uri: editor.document.uri,
                diagnostic,
                severity: this.mapDiagnosticSeverity(diagnostic.severity),
                source: diagnostic.source || 'unknown',
                isNew: false,
            }))

            // Format the context for chat
            const formattedProblems = this.autoDebugController.formatProblemsForChat(problems)
            const contextMessage = this.createChatMessage(selectedText, filePath, languageId, formattedProblems)

            // Focus Amazon Q chat and add the context
            await focusAmazonQPanel.execute(placeholder, 'autoDebug')
            await this.addMessageToChat(contextMessage)

            this.logger.debug('ContextMenuProvider: Successfully added code to Amazon Q chat')
        } catch (error) {
            this.logger.error('ContextMenuProvider: Error adding code to Amazon Q: %s', error)
            void vscode.window.showErrorMessage('Failed to add code to Amazon Q chat')
        }
    }

    /**
     * Initiates a focused debugging session with Amazon Q
     */
    private async fixWithAmazonQ(range?: vscode.Range, diagnostics?: vscode.Diagnostic[]): Promise<void> {
        this.logger.debug('ContextMenuProvider: Starting fix with Amazon Q')

        try {
            const editor = vscode.window.activeTextEditor
            if (!editor) {
                this.logger.warn('ContextMenuProvider: No active editor for fixWithAmazonQ')
                return
            }

            const selectedText = this.getSelectedText(editor, range)
            const filePath = editor.document.uri.fsPath
            const languageId = editor.document.languageId

            // Get diagnostics for the current location if not provided
            const contextDiagnostics = diagnostics || this.getDiagnosticsForRange(editor.document.uri, range)

            if (contextDiagnostics.length === 0) {
                void vscode.window.showInformationMessage('No problems found in the selected code')
                return
            }

            // Convert diagnostics to problems
            const problems = contextDiagnostics.map((diagnostic) => ({
                uri: editor.document.uri,
                diagnostic,
                severity: this.mapDiagnosticSeverity(diagnostic.severity),
                source: diagnostic.source || 'unknown',
                isNew: false,
            }))

            // Skip the broken LSP auto-fix and go directly to chat assistance
            const errorContexts = await this.autoDebugController.createErrorContexts(problems)
            const fixMessage = this.createFixMessage(selectedText, filePath, languageId, errorContexts)

            // Use the AutoDebugController to send the message through LSP
            // This will trigger the language server methods directly
            await this.autoDebugController.sendChatMessage(fixMessage, 'contextMenu')

            this.logger.debug('ContextMenuProvider: Successfully started fix session with Amazon Q')
        } catch (error) {
            this.logger.error('ContextMenuProvider: Error starting fix with Amazon Q: %s', error)
            void vscode.window.showErrorMessage('Failed to start fix session with Amazon Q')
        }
    }

    /**
     * Explains the problem using Amazon Q
     */
    private async explainProblem(range?: vscode.Range, diagnostics?: vscode.Diagnostic[]): Promise<void> {
        this.logger.debug('ContextMenuProvider: Explaining problem with Amazon Q')

        try {
            const editor = vscode.window.activeTextEditor
            if (!editor) {
                this.logger.warn('ContextMenuProvider: No active editor for explainProblem')
                return
            }

            // Get diagnostics for the current location if not provided
            const contextDiagnostics = diagnostics || this.getDiagnosticsForRange(editor.document.uri, range)

            if (contextDiagnostics.length === 0) {
                void vscode.window.showInformationMessage('No problems found at the current location')
                return
            }

            // Convert diagnostics to problems
            const problems = contextDiagnostics.map((diagnostic) => ({
                uri: editor.document.uri,
                diagnostic,
                severity: this.mapDiagnosticSeverity(diagnostic.severity),
                source: diagnostic.source || 'unknown',
                isNew: false,
            }))

            // Create explanation message
            const explanationMessage = this.createExplanationMessage(problems)

            // Focus Amazon Q chat and ask for explanation
            await focusAmazonQPanel.execute(placeholder, 'autoDebug')
            await this.addMessageToChat(explanationMessage)

            this.logger.debug('ContextMenuProvider: Successfully requested problem explanation')
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

    private getDiagnosticsForRange(uri: vscode.Uri, range?: vscode.Range): vscode.Diagnostic[] {
        const allDiagnostics = vscode.languages.getDiagnostics(uri)

        if (!range) {
            return allDiagnostics
        }

        return allDiagnostics.filter((diagnostic) => diagnostic.range.intersection(range) !== undefined)
    }

    private mapDiagnosticSeverity(severity: vscode.DiagnosticSeverity): 'error' | 'warning' | 'info' | 'hint' {
        switch (severity) {
            case vscode.DiagnosticSeverity.Error:
                return 'error'
            case vscode.DiagnosticSeverity.Warning:
                return 'warning'
            case vscode.DiagnosticSeverity.Information:
                return 'info'
            case vscode.DiagnosticSeverity.Hint:
                return 'hint'
            default:
                return 'info'
        }
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

    private async addMessageToChat(message: string): Promise<void> {
        const triggerID = randomUUID()
        this.logger.debug('ContextMenuProvider: Adding message to chat with triggerID: %s', triggerID)
        this.logger.debug('ContextMenuProvider: Message content: %s', message.substring(0, 200))

        try {
            // Use the apps-to-webview publisher to send the message TO the webview
            // This will be processed by cwChatConnector.handleMessageReceive
            const appsToWebViewPublisher = DefaultAmazonQAppInitContext.instance.getAppsToWebViewMessagePublisher()

            this.logger.debug(
                'ContextMenuProvider: Apps-to-webview publisher found, sending editor context command message'
            )

            // Send the message in the format expected by cwChatConnector.handleMessageReceive
            // with type: 'editorContextCommandMessage' to trigger processEditorContextCommandMessage
            const editorContextMessage = {
                sender: 'CWChat', // Required for cwChatConnector routing
                type: 'editorContextCommandMessage',
                message: message,
                command: 'aws.amazonq.autoDebug.sendMessage',
                triggerID: triggerID,
                tabID: '', // Will be handled by the current selected tab
            }

            this.logger.debug('ContextMenuProvider: Publishing editor context message: %O', editorContextMessage)

            appsToWebViewPublisher.publish(editorContextMessage)

            this.logger.debug(
                'ContextMenuProvider: Editor context message published successfully with triggerID: %s',
                triggerID
            )
            this.logger.debug('ContextMenuProvider: Message sent to webview for processing')

            // Add a small delay to allow the message to be processed
            await new Promise((resolve) => setTimeout(resolve, 500))

            this.logger.debug('ContextMenuProvider: Successfully started fix session with Amazon Q')
        } catch (error) {
            this.logger.error(
                'ContextMenuProvider: Error sending message to chat with triggerID %s: %s',
                triggerID,
                error
            )
            this.logger.error(
                'ContextMenuProvider: Error stack: %s',
                error instanceof Error ? error.stack : 'No stack trace'
            )

            // Fallback: show detailed error message to user
            void vscode.window.showErrorMessage(
                `Failed to send message to Amazon Q chat (ID: ${triggerID.substring(0, 8)}...): ${error instanceof Error ? error.message : 'Unknown error'}`
            )
            throw error
        }
    }

    public dispose(): void {
        this.logger.debug('ContextMenuProvider: Disposing context menu provider')
        vscode.Disposable.from(...this.disposables).dispose()
    }
}
