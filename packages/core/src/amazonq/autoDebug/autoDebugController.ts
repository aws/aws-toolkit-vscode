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
import { randomUUID } from '../../shared/crypto'
import { mapDiagnosticSeverity } from './shared/diagnosticUtils'

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
            debounceMs: 500, // Wait 0.5 seconds before auto-sending to avoid spam
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
     * Marks that Amazon Q has responded (called when response is received)
     */
    public markAmazonQResponse(): void {
        this.logger.debug('AutoDebugController: Amazon Q response received')
    }

    /**
     * Called when Amazon Q completes a chat session and has potentially written code
     */
    public markAmazonQChatComplete(hasWrittenCode: boolean = false): void {
        if (hasWrittenCode) {
            this.logger.debug('AutoDebugController: Amazon Q chat completed with code changes')
        } else {
            this.logger.debug('AutoDebugController: Amazon Q chat completed without code changes')
        }
    }

    /**
     * Fix with Amazon Q - sends up to 15 error messages one time when user clicks the button
     */
    public async fixAllProblemsInFile(maxProblems: number = 15): Promise<void> {
        this.logger.debug('AutoDebugController: Starting single Fix with Amazon Q request')

        const editor = vscode.window.activeTextEditor
        if (!editor) {
            void vscode.window.showWarningMessage('No active editor found')
            return
        }

        const filePath = editor.document.uri.fsPath
        const fileName = editor.document.fileName

        try {
            // Start session if not active
            if (!this.currentSession) {
                await this.startSession()
            }

            // Get all diagnostics for the current file
            const allDiagnostics = vscode.languages.getDiagnostics(editor.document.uri)

            // Filter to only errors (not warnings/info)
            const errorDiagnostics = allDiagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error)

            if (errorDiagnostics.length === 0) {
                void vscode.window.showInformationMessage(`✅ No errors found in ${fileName}`)
                this.logger.debug('AutoDebugController: No errors found in current file')
                return
            }

            // Take up to maxProblems errors (15 by default)
            const diagnosticsToFix = errorDiagnostics.slice(0, maxProblems)
            const totalErrors = errorDiagnostics.length
            const errorsBeingSent = diagnosticsToFix.length

            this.logger.debug(
                `AutoDebugController: Found ${totalErrors} total errors, sending ${errorsBeingSent} to Amazon Q`
            )

            // Convert diagnostics to problems
            const problems = diagnosticsToFix.map((diagnostic) => ({
                uri: editor.document.uri,
                diagnostic,
                severity: mapDiagnosticSeverity(diagnostic.severity),
                source: diagnostic.source || 'unknown',
                isNew: false,
            }))

            // Get the code range that covers all the errors
            const problemRange = this.getProblemsRange(problems)
            const codeWithErrors = editor.document.getText(problemRange)
            const languageId = editor.document.languageId

            // Create fix message
            const fixMessage = this.createFixMessage(
                codeWithErrors,
                filePath,
                languageId,
                problems,
                totalErrors,
                errorsBeingSent
            )

            // Show progress message
            void vscode.window.showInformationMessage(
                `🔧 Sending ${errorsBeingSent} error${errorsBeingSent !== 1 ? 's' : ''} to Amazon Q for fixing...`
            )

            await this.sendChatMessage(fixMessage, 'singleFix')

            this.logger.debug('AutoDebugController: Fix request sent successfully')
        } catch (error) {
            this.logger.error('AutoDebugController: Error in fix process: %s', error)
            void vscode.window.showErrorMessage(
                `Error during fix process: ${error instanceof Error ? error.message : 'Unknown error'}`
            )
        }
    }

    private createFixMessage(
        selectedText: string,
        filePath: string,
        languageId: string,
        problems: any[],
        totalErrors: number,
        errorsBeingSent: number
    ): string {
        const parts = [
            `Please help me fix the following code issues:`,
            '',
            `**File:** ${filePath}`,
            `**Language:** ${languageId}`,
            `**Errors being sent:** ${errorsBeingSent}`,
            totalErrors > errorsBeingSent ? `**Total errors in file:** ${totalErrors}` : '',
            '',
            '**Code:**',
            `\`\`\`${languageId}`,
            selectedText,
            '```',
            '',
            '**Issues to fix:**',
        ]

        for (const problem of problems) {
            parts.push(`- **ERROR**: ${problem.diagnostic.message}`)
            parts.push(
                `  Location: Line ${problem.diagnostic.range.start.line + 1}, Column ${problem.diagnostic.range.start.character + 1}`
            )
            if (problem.source !== 'unknown') {
                parts.push(`  Source: ${problem.source}`)
            }
        }

        parts.push('')
        parts.push('Please fix the error in place in the file.')

        if (totalErrors > errorsBeingSent) {
            parts.push(
                `Note: This file has ${totalErrors} total errors, but I'm only sending ${errorsBeingSent} errors at a time to avoid overwhelming the system.`
            )
        }

        return parts.filter(Boolean).join('\n')
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

        // **ONLY trigger on specific file events (save/open) - NO continuous monitoring during typing**
        // This prevents notification spam while you're actively coding

        // Listen for file saves and check for errors
        this.disposables.push(
            vscode.workspace.onDidSaveTextDocument(async (document) => {
                await this.handleFileEvent(document, 'save')
            })
        )

        // Listen for file opens and check for errors
        this.disposables.push(
            vscode.workspace.onDidOpenTextDocument(async (document) => {
                await this.handleFileEvent(document, 'open')
            })
        )
    }

    /**
     * Handles file events (save/open) and checks for errors that should trigger auto-debug
     */
    private async handleFileEvent(document: vscode.TextDocument, eventType: 'save' | 'open'): Promise<void> {
        if (!this.config.enabled) {
            return
        }

        // **FIX #1: Ensure session exists - create one if needed**
        if (!this.currentSession) {
            this.logger.debug('AutoDebugController: No active session, starting new one for file event')
            await this.startSession()
        }

        this.logger.debug('AutoDebugController: Document %s, checking for errors: %s', eventType, document.fileName)

        // **Only trigger auto-notification if there are actual errors after file event**
        setTimeout(async () => {
            try {
                // Check if there are errors in the file
                const diagnostics = vscode.languages.getDiagnostics(document.uri)
                const errorDiagnostics = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error)

                if (errorDiagnostics.length > 0) {
                    this.logger.debug(`AutoDebugController: Found ${errorDiagnostics.length} errors after ${eventType}`)

                    // **FIX #1: Always show notification when errors are found (removed Amazon Q activity requirement)**
                    this.logger.debug(`AutoDebugController: Showing notification for errors found after ${eventType}`)

                    // Convert diagnostics to problems
                    const problems = errorDiagnostics.map((diagnostic) => ({
                        uri: document.uri,
                        diagnostic,
                        severity: mapDiagnosticSeverity(diagnostic.severity),
                        source: diagnostic.source || 'unknown',
                        isNew: true,
                    }))

                    // Update session with new problems
                    if (this.currentSession) {
                        this.currentSession = {
                            ...this.currentSession,
                            problems: [...this.currentSession.problems, ...problems],
                        }
                    }

                    // Fire the problems detected event - this triggers the notification in AutoDebugFeature
                    this.onProblemsDetected.fire(problems)

                    this.logger.debug('AutoDebugController: Problems detected event fired for notification')
                } else {
                    this.logger.debug(`AutoDebugController: No errors found after ${eventType}`)
                }
            } catch (error) {
                this.logger.error(`AutoDebugController: Error checking problems after ${eventType}: %s`, error)
            }
        }, this.config.debounceMs)
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
