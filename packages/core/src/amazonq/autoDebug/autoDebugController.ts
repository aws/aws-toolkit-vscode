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
        this.lspClient = new AutoDebugLspClient(client, encryptionKey)

        this.disposables.push(
            this.diagnosticsMonitor,
            this.onProblemsDetected,
            this.onSessionStarted,
            this.onSessionEnded
        )
    }

    /**
     * Starts a new auto debug session
     */
    public async startSession(): Promise<AutoDebugSession> {
        if (this.currentSession?.isActive) {
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
        return session
    }

    /**
     * Ends the current auto debug session
     */
    public async endSession(): Promise<void> {
        if (!this.currentSession) {
            return
        }
        const sessionId = this.currentSession.id
        this.currentSession = undefined
        this.onSessionEnded.fire(sessionId)
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
        if (!this.config.enabled) {
            return []
        }

        if (!this.currentSession) {
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
            this.onProblemsDetected.fire(filteredProblems)
        }

        return filteredProblems
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
     * Marks that Amazon Q has responded (called when response is received)
     */
    public markAmazonQResponse(): void {
        this.logger.debug('AutoDebugController: Amazon Q response received')
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
                return
            }

            // Take up to maxProblems errors (15 by default)
            const diagnosticsToFix = errorDiagnostics.slice(0, maxProblems)
            const totalErrors = errorDiagnostics.length
            const errorsBeingSent = diagnosticsToFix.length
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
            await this.sendChatMessage(fixMessage, 'singleFix')
        } catch (error) {
            this.logger.error('AutoDebugController: Error in fix process: %s', error)
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

    /**
     * Automatically fixes problems using the language server
     */
    public async autoFixProblems(problems: Problem[], filePath: string, autoApply: boolean = false): Promise<boolean> {
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
            return false
        } catch (error) {
            this.logger.error('AutoDebugController: Error during auto-fix: %s', error)
            return false
        }
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
