/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger/logger'
import { DiagnosticsMonitor, DiagnosticSnapshot } from './diagnostics/diagnosticsMonitor'
import { ProblemDetector, Problem, CategorizedProblems } from './diagnostics/problemDetector'
import { ErrorContextFormatter, ErrorContext } from './diagnostics/errorContext'
import { AutoDebugLspClient } from './lsp/autoDebugLspClient'
import { focusAmazonQPanel } from '../../codewhispererChat/commands/registerCommands'
import { placeholder } from '../../shared/vscode/commands2'
import { randomUUID } from '../../shared/crypto'

export interface AutoDebugConfig {
    readonly enabled: boolean
    readonly autoReportThreshold: number
    readonly includedSources: string[]
    readonly excludedSources: string[]
    readonly severityFilter: ('error' | 'warning' | 'info' | 'hint')[]
    readonly debounceMs: number
}

export interface AutoDebugSession {
    readonly id: string
    readonly startTime: number
    readonly baseline: DiagnosticSnapshot
    readonly problems: Problem[]
    readonly isActive: boolean
}

/**
 * Main controller for the Amazon Q Auto Debug system.
 * Orchestrates diagnostic monitoring, problem detection, and AI-powered debugging assistance.
 */
export class AutoDebugController implements vscode.Disposable {
    private readonly logger = getLogger('amazonqLsp')
    private readonly diagnosticsMonitor: DiagnosticsMonitor
    private readonly problemDetector: ProblemDetector
    private readonly errorFormatter: ErrorContextFormatter
    private readonly lspClient: AutoDebugLspClient
    private readonly disposables: vscode.Disposable[] = []

    private currentSession: AutoDebugSession | undefined
    private config: AutoDebugConfig
    private isProcessing = false

    public readonly onProblemsDetected = new vscode.EventEmitter<Problem[]>()
    public readonly onSessionStarted = new vscode.EventEmitter<AutoDebugSession>()
    public readonly onSessionEnded = new vscode.EventEmitter<string>()

    constructor(config?: Partial<AutoDebugConfig>, client?: any, encryptionKey?: Buffer) {
        this.logger.debug('AutoDebugController: Initializing auto debug controller')

        this.config = {
            enabled: true,
            autoReportThreshold: 1, // Report when 1 or more errors detected
            includedSources: [], // Empty means include all
            excludedSources: ['spell-checker'], // Common sources to exclude
            severityFilter: ['error'], // Only auto-fix errors, not warnings
            debounceMs: 2000, // Wait 2 seconds before auto-sending to avoid spam
            ...config,
        }

        this.diagnosticsMonitor = new DiagnosticsMonitor()
        this.problemDetector = new ProblemDetector()
        this.errorFormatter = new ErrorContextFormatter()

        // Create the core package LSP client (this delegates to the real one in amazonq package)
        this.lspClient = new AutoDebugLspClient(client, encryptionKey)

        this.setupEventHandlers()
        this.disposables.push(
            this.diagnosticsMonitor,
            this.onProblemsDetected,
            this.onSessionStarted,
            this.onSessionEnded
        )

        this.logger.debug('AutoDebugController: Initialization complete')
    }

    /**
     * Starts a new auto debug session
     */
    public async startSession(): Promise<AutoDebugSession> {
        this.logger.debug('AutoDebugController: Starting new auto debug session')

        if (this.currentSession?.isActive) {
            this.logger.debug('AutoDebugController: Ending previous session %s', this.currentSession.id)
            await this.endSession()
        }

        const baseline = await this.diagnosticsMonitor.captureBaseline()
        const session: AutoDebugSession = {
            id: this.generateSessionId(),
            startTime: Date.now(),
            baseline,
            problems: [],
            isActive: true,
        }

        this.currentSession = session
        this.onSessionStarted.fire(session)

        this.logger.debug('AutoDebugController: Started session %s', session.id)
        return session
    }

    /**
     * Ends the current auto debug session
     */
    public async endSession(): Promise<void> {
        if (!this.currentSession) {
            this.logger.debug('AutoDebugController: No active session to end')
            return
        }

        const sessionId = this.currentSession.id
        this.logger.debug('AutoDebugController: Ending session %s', sessionId)

        this.currentSession = undefined
        this.onSessionEnded.fire(sessionId)

        this.logger.debug('AutoDebugController: Session %s ended', sessionId)
    }

    /**
     * Gets the current active session
     */
    public getCurrentSession(): AutoDebugSession | undefined {
        return this.currentSession
    }

    /**
     * Manually triggers problem detection
     */
    public async detectProblems(): Promise<Problem[]> {
        this.logger.debug('AutoDebugController: Manual problem detection triggered')

        if (!this.config.enabled) {
            this.logger.debug('AutoDebugController: Auto debug is disabled')
            return []
        }

        if (!this.currentSession) {
            this.logger.debug('AutoDebugController: No active session, starting new one')
            await this.startSession()
        }

        const currentDiagnostics = await this.diagnosticsMonitor.getCurrentDiagnostics(false)
        const currentSnapshot: DiagnosticSnapshot = {
            diagnostics: currentDiagnostics,
            captureTime: Date.now(),
            id: this.generateSnapshotId(),
        }

        const newProblems = this.problemDetector.detectNewProblems(this.currentSession!.baseline, currentSnapshot)

        const filteredProblems = this.filterProblems(newProblems)

        if (filteredProblems.length > 0) {
            this.logger.debug('AutoDebugController: Detected %d new problems', filteredProblems.length)
            this.onProblemsDetected.fire(filteredProblems)
        }

        return filteredProblems
    }

    /**
     * Creates formatted error contexts for AI debugging
     */
    public async createErrorContexts(problems: Problem[]): Promise<ErrorContext[]> {
        this.logger.debug('AutoDebugController: Creating error contexts for %d problems', problems.length)

        const contexts: ErrorContext[] = []

        for (const problem of problems) {
            try {
                const context = await this.errorFormatter.createErrorContext(problem)
                contexts.push(context)
            } catch (error) {
                this.logger.warn('AutoDebugController: Failed to create context for problem: %s', error)
            }
        }

        this.logger.debug('AutoDebugController: Created %d error contexts', contexts.length)
        return contexts
    }

    /**
     * Formats problems for display or AI consumption
     */
    public formatProblemsForChat(problems: Problem[]): string {
        this.logger.debug('AutoDebugController: Formatting %d problems for chat', problems.length)

        const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd()
        return this.errorFormatter.formatProblemsString(problems, cwd)
    }

    /**
     * Gets categorized problems from the current session
     */
    public getCategorizedProblems(): CategorizedProblems | undefined {
        if (!this.currentSession) {
            return undefined
        }

        return this.problemDetector.categorizeBySeverity(this.currentSession.problems)
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
        this.logger.debug('AutoDebugController: Configuration updated')
    }

    /**
     * Sets the language client for LSP communication
     */
    public setLanguageClient(client: any): void {
        this.lspClient.setLanguageClient(client)
        this.logger.debug('AutoDebugController: Language client set')
    }

    /**
     * Sends a chat message through the LSP client (public interface)
     */
    public async sendChatMessage(message: string, source: string): Promise<void> {
        this.logger.debug('AutoDebugController: Public sendChatMessage called from source: %s', source)
        await this.sendMessageToChat(message)
    }

    /**
     * Sends message directly to language server bypassing webview connectors
     * This ensures messages go through the proper LSP chat system
     */
    private async sendMessageToChat(message: string): Promise<void> {
        const triggerID = randomUUID()
        this.logger.debug(
            'AutoDebugController: Sending message directly to language server with triggerID: %s',
            triggerID
        )
        this.logger.debug('AutoDebugController: Message content: %s', message.substring(0, 200))

        try {
            // **DIRECT LSP APPROACH**: Send directly to language server to avoid webview routing issues
            // The previous approach was going through webview connectors which use the wrong format

            if (!this.lspClient.isAvailable()) {
                this.logger.error('AutoDebugController: LSP client not available')
                throw new Error('LSP client not available for auto-debug chat')
            }

            // Use the LSP client to send chat request directly to language server
            const success = await this.lspClient.sendChatMessage({
                message: message,
                triggerType: 'autoDebug',
                eventId: triggerID,
            })

            if (success) {
                this.logger.debug('AutoDebugController: Chat message sent successfully through LSP client')

                // Also update the UI to show the message if possible
                try {
                    const mynahUiInstance = (global as any).mynahUiInstance
                    if (mynahUiInstance) {
                        const tabId = mynahUiInstance.getSelectedTabId() || mynahUiInstance.updateStore('', {})
                        if (tabId) {
                            // Add the user prompt to the UI to show what AutoDebug sent
                            mynahUiInstance.addChatItem(tabId, {
                                type: 'prompt',
                                body: message,
                            })

                            // Set loading state
                            mynahUiInstance.updateStore(tabId, {
                                loadingChat: true,
                                cancelButtonWhenLoading: true,
                                promptInputDisabledState: false,
                            })

                            // Add initial empty response
                            mynahUiInstance.addChatItem(tabId, {
                                type: 'answer-stream',
                            })

                            this.logger.debug('AutoDebugController: Updated UI to show AutoDebug message')
                        }
                    }
                } catch (uiError) {
                    // UI update is optional - don't fail if it doesn't work
                    this.logger.warn('AutoDebugController: Could not update UI, but message was sent: %s', uiError)
                }
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
            this.logger.error(
                'AutoDebugController: Error stack: %s',
                error instanceof Error ? error.stack : 'No stack trace'
            )
            throw error
        }
    }

    /**
     * Automatically fixes problems using the language server
     */
    public async autoFixProblems(problems: Problem[], filePath: string, autoApply: boolean = false): Promise<boolean> {
        this.logger.debug('AutoDebugController: Auto-fixing %d problems for %s', problems.length, filePath)
        this.logger.debug(
            'AutoDebugController: Problems to fix: %s',
            problems
                .map((p) => `${p.severity}: ${p.diagnostic.message} at line ${p.diagnostic.range.start.line}`)
                .join(', ')
        )

        if (!this.lspClient.isAvailable()) {
            this.logger.warn('AutoDebugController: Language client not available for auto-fix')
            this.logger.debug(
                'AutoDebugController: LSP client availability check failed - client may not be initialized or connected'
            )
            return false
        }

        this.logger.debug('AutoDebugController: Language client is available, proceeding with auto-fix')

        try {
            // Get file content
            const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath))
            const fileContent = document.getText()

            // Create error contexts
            const errorContexts = await this.createErrorContexts(problems)

            // Request fixes from language server
            const fixResult = await this.lspClient.requestAutoFix({
                problems,
                errorContexts,
                filePath,
                fileContent,
                autoApply,
            })

            if (!fixResult.success) {
                this.logger.error('AutoDebugController: Auto-fix failed: %s', fixResult.error)
                return false
            }

            if (fixResult.fixes.length === 0) {
                this.logger.debug('AutoDebugController: No fixes generated')
                return false
            }

            this.logger.debug('AutoDebugController: Generated %d fixes', fixResult.fixes.length)

            // Show fixes to user and optionally apply them
            if (autoApply) {
                const success = await this.lspClient.applyFixes(fixResult.fixes, filePath)
                if (success) {
                    void vscode.window.showInformationMessage(
                        `Applied ${fixResult.fixes.length} automatic fix${fixResult.fixes.length !== 1 ? 'es' : ''} to ${filePath}`
                    )
                }
                return success
            } else {
                // Show fixes to user for review
                const choice = await vscode.window.showInformationMessage(
                    `Amazon Q generated ${fixResult.fixes.length} fix${fixResult.fixes.length !== 1 ? 'es' : ''} for ${filePath}. Apply them?`,
                    'Apply Fixes',
                    'Review Fixes',
                    'Cancel'
                )

                if (choice === 'Apply Fixes') {
                    const success = await this.lspClient.applyFixes(fixResult.fixes, filePath)
                    if (success) {
                        void vscode.window.showInformationMessage(
                            `Applied ${fixResult.fixes.length} fix${fixResult.fixes.length !== 1 ? 'es' : ''} to ${filePath}`
                        )
                    }
                    return success
                } else if (choice === 'Review Fixes') {
                    await this.showFixesForReview(fixResult.fixes, filePath, fixResult.explanation)
                    return false
                }
            }

            return false
        } catch (error) {
            this.logger.error('AutoDebugController: Error during auto-fix: %s', error)
            void vscode.window.showErrorMessage(
                `Failed to auto-fix problems: ${error instanceof Error ? error.message : 'Unknown error'}`
            )
            return false
        }
    }

    /**
     * Shows fixes for user review
     */
    private async showFixesForReview(fixes: any[], filePath: string, explanation?: string): Promise<void> {
        const fixDescriptions = fixes
            .map((fix, index) => `${index + 1}. ${fix.description} (Confidence: ${fix.confidence})`)
            .join('\n')

        const content = `# Auto Debug Fixes for ${filePath}

${
    explanation
        ? `## Explanation
${explanation}

`
        : ''
}## Proposed Fixes
${fixDescriptions}

## Next Steps
You can manually apply these fixes or use the "Apply Fixes" option from the notification.`

        const doc = await vscode.workspace.openTextDocument({
            content,
            language: 'markdown',
        })
        await vscode.window.showTextDocument(doc)
    }

    private setupEventHandlers(): void {
        this.logger.debug('AutoDebugController: Setting up event handlers')

        // Listen for diagnostic changes
        this.disposables.push(
            this.diagnosticsMonitor.onDiagnosticsChanged(async (diagnostics) => {
                if (this.isProcessing || !this.config.enabled || !this.currentSession) {
                    return
                }

                this.isProcessing = true
                try {
                    await this.handleDiagnosticChange(diagnostics)
                } catch (error) {
                    this.logger.error('AutoDebugController: Error handling diagnostic change: %s', error)
                } finally {
                    this.isProcessing = false
                }
            })
        )

        // Listen for workspace changes that might affect diagnostics
        this.disposables.push(
            vscode.workspace.onDidSaveTextDocument(async (document) => {
                if (this.config.enabled && this.currentSession) {
                    this.logger.debug(
                        'AutoDebugController: Document saved, checking for problems: %s',
                        document.fileName
                    )
                    // Debounce the problem detection
                    setTimeout(() => {
                        this.detectProblems().catch((error) => {
                            this.logger.error('AutoDebugController: Error detecting problems after save: %s', error)
                        })
                    }, this.config.debounceMs)
                }
            })
        )
    }

    private async handleDiagnosticChange(diagnostics: any): Promise<void> {
        this.logger.debug(
            'AutoDebugController: handleDiagnosticChange called - session exists: %s, enabled: %s',
            !!this.currentSession,
            this.config.enabled
        )

        if (!this.currentSession) {
            this.logger.debug('AutoDebugController: No current session, skipping diagnostic change')
            return
        }

        this.logger.debug('AutoDebugController: Handling diagnostic change')

        const currentSnapshot: DiagnosticSnapshot = {
            diagnostics,
            captureTime: Date.now(),
            id: this.generateSnapshotId(),
        }

        const newProblems = this.problemDetector.detectNewProblems(this.currentSession.baseline, currentSnapshot)
        this.logger.debug('AutoDebugController: Detected %d new problems before filtering', newProblems.length)

        const filteredProblems = this.filterProblems(newProblems)
        this.logger.debug(
            'AutoDebugController: %d problems after filtering (threshold: %d)',
            filteredProblems.length,
            this.config.autoReportThreshold
        )

        if (filteredProblems.length >= this.config.autoReportThreshold) {
            this.logger.debug('AutoDebugController: Auto-reporting %d problems', filteredProblems.length)

            // Update session with new problems
            this.currentSession = {
                ...this.currentSession,
                problems: [...this.currentSession.problems, ...filteredProblems],
            }

            // **NEW: Auto-send to chat instead of just emitting event**
            await this.autoSendProblemsToChat(filteredProblems)

            this.onProblemsDetected.fire(filteredProblems)
        } else {
            this.logger.debug('AutoDebugController: Not enough problems to trigger auto-report')
        }
    }

    /**
     * Automatically sends detected problems to Amazon Q chat for fixing
     */
    private async autoSendProblemsToChat(problems: Problem[]): Promise<void> {
        try {
            const editor = vscode.window.activeTextEditor
            if (!editor) {
                this.logger.warn('AutoDebugController: No active editor for auto-send to chat')
                return
            }

            const filePath = editor.document.uri.fsPath
            const languageId = editor.document.languageId

            // Get the problematic code section
            const problemRange = this.getProblemsRange(problems)
            const selectedText = editor.document.getText(problemRange)

            // Format problems for chat
            const formattedProblems = this.formatProblemsForChat(problems)

            // Create auto-debug specific message
            const autoDebugMessage = this.createAutoDebugChatMessage(
                selectedText,
                filePath,
                languageId,
                formattedProblems
            )

            // Focus Amazon Q chat and send the message
            await focusAmazonQPanel.execute(placeholder, 'autoDebug')
            await this.sendMessageToChat(autoDebugMessage)

            this.logger.debug('AutoDebugController: Successfully auto-sent problems to chat')

            // Show notification to user
            void vscode.window.showInformationMessage(
                `Amazon Q is analyzing ${problems.length} error${problems.length !== 1 ? 's' : ''} in your code...`
            )
        } catch (error) {
            this.logger.error('AutoDebugController: Error auto-sending problems to chat: %s', error)
        }
    }

    /**
     * Creates a chat message specifically for auto-debug scenarios
     */
    private createAutoDebugChatMessage(
        selectedText: string,
        filePath: string,
        languageId: string,
        problems: string
    ): string {
        const parts = [
            '🔧 **Auto Debug**: I detected some errors in your code. Please help me fix them:',
            '',
            `**File:** ${filePath}`,
            `**Language:** ${languageId}`,
            '',
            '**Code with errors:**',
            `\`\`\`${languageId}`,
            selectedText,
            '```',
            '',
            '**Detected Issues:**',
            problems,
            '',
            'Please fix the error in place in the file.',
        ]

        return parts.join('\n')
    }

    /**
     * Gets the range that encompasses all problems
     */
    private getProblemsRange(problems: Problem[]): vscode.Range {
        if (problems.length === 0) {
            return new vscode.Range(0, 0, 0, 0)
        }

        let startLine = problems[0].diagnostic.range.start.line
        let endLine = problems[0].diagnostic.range.end.line

        for (const problem of problems) {
            startLine = Math.min(startLine, problem.diagnostic.range.start.line)
            endLine = Math.max(endLine, problem.diagnostic.range.end.line)
        }

        // Add some context lines around the errors
        const contextLines = 3
        startLine = Math.max(0, startLine - contextLines)
        endLine = endLine + contextLines

        return new vscode.Range(startLine, 0, endLine, 0)
    }

    private filterProblems(problems: Problem[]): Problem[] {
        let filtered = problems

        // Filter by severity
        filtered = filtered.filter((problem) => this.config.severityFilter.includes(problem.severity))

        // Filter by included sources
        if (this.config.includedSources.length > 0) {
            filtered = filtered.filter((problem) => this.config.includedSources.includes(problem.source))
        }

        // Filter out excluded sources
        if (this.config.excludedSources.length > 0) {
            filtered = filtered.filter((problem) => !this.config.excludedSources.includes(problem.source))
        }

        return filtered
    }

    private generateSessionId(): string {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }

    private generateSnapshotId(): string {
        return `snapshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }

    public dispose(): void {
        this.logger.debug('AutoDebugController: Disposing auto debug controller')

        if (this.currentSession) {
            this.endSession().catch((error) => {
                this.logger.error('AutoDebugController: Error ending session during disposal: %s', error)
            })
        }

        vscode.Disposable.from(...this.disposables).dispose()
    }
}
