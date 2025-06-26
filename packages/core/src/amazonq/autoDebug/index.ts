/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../shared/logger/logger'
import { AutoDebugController, AutoDebugConfig } from './autoDebugController'
import { ContextMenuProvider } from './ide/contextMenuProvider'
import { AutoDebugCodeActionsProvider } from './ide/codeActionsProvider'
import { Commands } from '../../shared/vscode/commands2'
import { focusAmazonQPanel } from '../../codewhispererChat/commands/registerCommands'
import { placeholder } from '../../shared/vscode/commands2'

/**
 * Main entry point for Amazon Q Auto Debug feature.
 * Initializes and manages all auto debug components.
 */
export class AutoDebugFeature implements vscode.Disposable {
    private readonly logger = getLogger('amazonqLsp')
    private readonly disposables: vscode.Disposable[] = []

    private autoDebugController: AutoDebugController | undefined
    private contextMenuProvider: ContextMenuProvider | undefined
    private codeActionsProvider: AutoDebugCodeActionsProvider | undefined

    constructor() {
        this.logger.debug('AutoDebugFeature: Initializing Amazon Q Auto Debug feature')
    }

    /**
     * Activates the auto debug feature
     */
    public async activate(
        context: vscode.ExtensionContext,
        config?: Partial<AutoDebugConfig>,
        client?: any,
        encryptionKey?: Buffer
    ): Promise<void> {
        this.logger.debug('AutoDebugFeature: Activating auto debug feature')
        this.logger.debug('AutoDebugFeature: Client provided: %s', client ? 'yes' : 'no')
        this.logger.debug('AutoDebugFeature: Encryption key provided: %s', encryptionKey ? 'yes' : 'no')

        try {
            // Initialize core components

            // Initialize main controller with client and encryptionKey
            this.autoDebugController = new AutoDebugController(config, client, encryptionKey)
            this.disposables.push(this.autoDebugController)

            // Initialize IDE integration components
            this.contextMenuProvider = new ContextMenuProvider(this.autoDebugController)
            this.disposables.push(this.contextMenuProvider)

            this.codeActionsProvider = new AutoDebugCodeActionsProvider(this.autoDebugController)
            this.disposables.push(this.codeActionsProvider)

            // Register additional commands
            this.registerCommands()

            // Set up event handlers
            this.setupEventHandlers()

            // **CRITICAL FIX**: Start an auto debug session to enable diagnostic monitoring
            // Without an active session, the AutoDebugController won't monitor diagnostic changes
            if (this.autoDebugController.getConfig().enabled) {
                this.logger.debug('AutoDebugFeature: Starting initial auto debug session')
                await this.autoDebugController.startSession()
                this.logger.debug('AutoDebugFeature: Initial auto debug session started successfully')
            } else {
                this.logger.debug('AutoDebugFeature: Auto debug is disabled, not starting session')
            }

            this.logger.debug('AutoDebugFeature: Auto debug feature activated successfully')
        } catch (error) {
            this.logger.error('AutoDebugFeature: Failed to activate auto debug feature: %s', error)
            throw error
        }
    }

    /**
     * Gets the auto debug controller instance
     */
    public getController(): AutoDebugController | undefined {
        return this.autoDebugController
    }

    /**
     * Updates the auto debug configuration
     */
    public updateConfig(config: Partial<AutoDebugConfig>): void {
        this.logger.debug('AutoDebugFeature: Updating auto debug configuration')
        this.autoDebugController?.updateConfig(config)
    }

    /**
     * Checks if auto debug is currently enabled
     */
    public isEnabled(): boolean {
        return this.autoDebugController?.getConfig().enabled ?? false
    }

    /**
     * Manually triggers problem detection
     */
    public async detectProblems(): Promise<void> {
        this.logger.debug('AutoDebugFeature: Manual problem detection triggered')

        if (!this.autoDebugController) {
            this.logger.warn('AutoDebugFeature: Auto debug controller not initialized')
            return
        }

        try {
            const problems = await this.autoDebugController.detectProblems()

            if (problems.length > 0) {
                const message = `Found ${problems.length} problem${problems.length !== 1 ? 's' : ''} in your code`
                void vscode.window.showInformationMessage(message)
            } else {
                void vscode.window.showInformationMessage('No new problems detected')
            }
        } catch (error) {
            this.logger.error('AutoDebugFeature: Error detecting problems: %s', error)
            void vscode.window.showErrorMessage('Failed to detect problems')
        }
    }

    /**
     * Triggers automatic fixing of problems
     */
    private async triggerAutoFix(problems: any[]): Promise<void> {
        this.logger.debug('AutoDebugFeature: Triggering auto fix for %d problems', problems.length)

        if (!this.autoDebugController) {
            this.logger.warn('AutoDebugFeature: Auto debug controller not initialized')
            return
        }

        try {
            // Group problems by file
            const problemsByFile = new Map<string, any[]>()

            for (const problem of problems) {
                const filePath = problem.uri.fsPath
                if (!problemsByFile.has(filePath)) {
                    problemsByFile.set(filePath, [])
                }
                problemsByFile.get(filePath)!.push(problem)
            }

            // Process each file
            for (const [filePath, fileProblems] of problemsByFile) {
                this.logger.debug('AutoDebugFeature: Auto-fixing %d problems in %s', fileProblems.length, filePath)

                try {
                    const success = await this.autoDebugController.autoFixProblems(fileProblems, filePath, false)
                    if (success) {
                        this.logger.debug('AutoDebugFeature: Successfully auto-fixed problems in %s', filePath)
                    } else {
                        this.logger.debug('AutoDebugFeature: Auto-fix was not applied for %s', filePath)
                    }
                } catch (error) {
                    this.logger.error('AutoDebugFeature: Error auto-fixing problems in %s: %s', filePath, error)
                }
            }
        } catch (error) {
            this.logger.error('AutoDebugFeature: Error during auto-fix trigger: %s', error)
            void vscode.window.showErrorMessage(
                `Failed to trigger auto-fix: ${error instanceof Error ? error.message : 'Unknown error'}`
            )
        }
    }

    /**
     * Sets the language client and encryption key for LSP communication
     */
    public setLanguageClient(client: any, encryptionKey?: Buffer): void {
        // Set the language client on the controller
        this.autoDebugController?.setLanguageClient(client)

        // If encryptionKey is provided, update the AutoDebug LSP client
        if (encryptionKey && this.autoDebugController) {
            try {
                const lspClient = (this.autoDebugController as any).lspClient
                if (lspClient && typeof lspClient.setEncryptionKey === 'function') {
                    lspClient.setEncryptionKey(encryptionKey)
                    this.logger.debug('AutoDebugFeature: Encryption key set on LSP client')
                } else {
                    this.logger.warn('AutoDebugFeature: LSP client does not support setEncryptionKey method')
                }
            } catch (error) {
                this.logger.error('AutoDebugFeature: Error setting encryption key: %s', error)
            }
        }

        this.logger.debug(
            'AutoDebugFeature: Language client set (encryptionKey: %s)',
            encryptionKey ? 'provided' : 'not provided'
        )
    }

    private registerCommands(): void {
        this.logger.debug('AutoDebugFeature: Registering additional commands')

        // Register manual problem detection command
        this.disposables.push(
            Commands.register('amazonq.autoDebug.detectProblems', async () => {
                await this.detectProblems()
            })
        )

        // Register toggle command
        this.disposables.push(
            Commands.register('amazonq.autoDebug.toggle', async () => {
                await this.toggleAutoDebug()
            })
        )

        // Register status command
        this.disposables.push(
            Commands.register('amazonq.autoDebug.showStatus', async () => {
                await this.showStatus()
            })
        )
    }

    private setupEventHandlers(): void {
        this.logger.debug('AutoDebugFeature: Setting up event handlers')

        if (!this.autoDebugController) {
            return
        }

        // Listen for problems detected
        this.disposables.push(
            this.autoDebugController.onProblemsDetected.event((problems) => {
                this.logger.debug('AutoDebugFeature: Problems detected event received: %d problems', problems.length)

                // Show notification for critical problems
                const criticalProblems = problems.filter((p) => p.severity === 'error')
                if (criticalProblems.length > 0) {
                    const message = `Amazon Q detected ${criticalProblems.length} error${criticalProblems.length !== 1 ? 's' : ''} in your code`
                    void vscode.window
                        .showWarningMessage(message, 'Auto Fix', 'Fix with Amazon Q', 'Dismiss')
                        .then((selection) => {
                            if (selection === 'Auto Fix') {
                                void this.triggerAutoFix(criticalProblems)
                            } else if (selection === 'Fix with Amazon Q') {
                                void focusAmazonQPanel.execute(placeholder, 'autoDebug')
                            }
                        })
                }
            })
        )

        // Listen for session events
        this.disposables.push(
            this.autoDebugController.onSessionStarted.event((session) => {
                this.logger.debug('AutoDebugFeature: Auto debug session started: %s', session.id)
            })
        )

        this.disposables.push(
            this.autoDebugController.onSessionEnded.event((sessionId) => {
                this.logger.debug('AutoDebugFeature: Auto debug session ended: %s', sessionId)
            })
        )
    }

    private async toggleAutoDebug(): Promise<void> {
        this.logger.debug('AutoDebugFeature: Toggling auto debug')

        if (!this.autoDebugController) {
            void vscode.window.showErrorMessage('Auto Debug is not initialized')
            return
        }

        const currentConfig = this.autoDebugController.getConfig()
        const newEnabled = !currentConfig.enabled

        this.autoDebugController.updateConfig({ enabled: newEnabled })

        const status = newEnabled ? 'enabled' : 'disabled'
        void vscode.window.showInformationMessage(`Amazon Q Auto Debug ${status}`)

        this.logger.debug('AutoDebugFeature: Auto debug toggled to %s', status)
    }

    private async showStatus(): Promise<void> {
        this.logger.debug('AutoDebugFeature: Showing auto debug status')

        if (!this.autoDebugController) {
            void vscode.window.showInformationMessage('Amazon Q Auto Debug: Not initialized')
            return
        }

        const config = this.autoDebugController.getConfig()
        const session = this.autoDebugController.getCurrentSession()
        const categorizedProblems = this.autoDebugController.getCategorizedProblems()

        const statusParts = [
            `**Amazon Q Auto Debug Status**`,
            ``,
            `**Enabled:** ${config.enabled ? 'Yes' : 'No'}`,
            `**Auto Report Threshold:** ${config.autoReportThreshold}`,
            `**Severity Filter:** ${config.severityFilter.join(', ')}`,
            ``,
        ]

        if (session) {
            statusParts.push(`**Active Session:** ${session.id.substring(0, 8)}...`)
            statusParts.push(`**Session Started:** ${new Date(session.startTime).toLocaleString()}`)
            statusParts.push(`**Total Problems:** ${session.problems.length}`)
        } else {
            statusParts.push(`**Active Session:** None`)
        }

        if (categorizedProblems) {
            statusParts.push(``)
            statusParts.push(`**Current Problems:**`)
            statusParts.push(`- Errors: ${categorizedProblems.errors.length}`)
            statusParts.push(`- Warnings: ${categorizedProblems.warnings.length}`)
            statusParts.push(`- Info: ${categorizedProblems.info.length}`)
            statusParts.push(`- Hints: ${categorizedProblems.hints.length}`)
        }

        const statusMessage = statusParts.join('\n')

        // Show in a new document for better readability
        const doc = await vscode.workspace.openTextDocument({
            content: statusMessage,
            language: 'markdown',
        })
        await vscode.window.showTextDocument(doc)
    }

    public dispose(): void {
        this.logger.debug('AutoDebugFeature: Disposing auto debug feature')
        vscode.Disposable.from(...this.disposables).dispose()
    }
}

// Export main components for external use
export { AutoDebugController, AutoDebugConfig } from './autoDebugController'
export { AutoDebugLspClient } from './lsp/autoDebugLspClient'
export { DiagnosticsMonitor, DiagnosticCollection, DiagnosticSnapshot } from './diagnostics/diagnosticsMonitor'
export { ProblemDetector, Problem, CategorizedProblems } from './diagnostics/problemDetector'
export { ErrorContextFormatter, ErrorContext, FormattedErrorReport } from './diagnostics/errorContext'
export { ContextMenuProvider } from './ide/contextMenuProvider'
export { AutoDebugCodeActionsProvider } from './ide/codeActionsProvider'
