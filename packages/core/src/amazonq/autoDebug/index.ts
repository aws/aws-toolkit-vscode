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

            this.codeActionsProvider = new AutoDebugCodeActionsProvider()
            this.disposables.push(this.codeActionsProvider)

            // Register additional commands
            this.registerCommands()

            // Set up event handlers
            this.setupEventHandlers()

            this.logger.debug('AutoDebugFeature: Auto debug feature components initialized')

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
     * Manually triggers problem detection (simplified - just shows current file diagnostics)
     */
    public async detectProblems(): Promise<void> {
        this.logger.debug('AutoDebugFeature: Manual problem detection triggered')

        const editor = vscode.window.activeTextEditor
        if (!editor) {
            void vscode.window.showWarningMessage('No active editor found')
            return
        }

        try {
            const diagnostics = vscode.languages.getDiagnostics(editor.document.uri)
            const errorCount = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error).length
            const warningCount = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Warning).length

            if (errorCount > 0 || warningCount > 0) {
                const message = `Found ${errorCount} error(s) and ${warningCount} warning(s) in current file`
                void vscode.window.showInformationMessage(message)
            } else {
                void vscode.window.showInformationMessage('No problems detected in current file')
            }
        } catch (error) {
            this.logger.error('AutoDebugFeature: Error detecting problems: %s', error)
            void vscode.window.showErrorMessage('Failed to detect problems')
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
    }

    private setupEventHandlers(): void {
        this.logger.debug('AutoDebugFeature: Setting up event handlers (simplified)')
        // No complex event handling needed for context menu/quick fix functionality
    }

    public dispose(): void {
        this.logger.debug('AutoDebugFeature: Disposing auto debug feature')
        vscode.Disposable.from(...this.disposables).dispose()
    }
}

// Export main components for external use
export { AutoDebugController, AutoDebugConfig } from './autoDebugController'
export { AutoDebugLspClient } from './lsp/autoDebugLspClient'
export { ErrorContextFormatter, ErrorContext, FormattedErrorReport } from './diagnostics/errorContext'
export { ContextMenuProvider } from './ide/contextMenuProvider'
export { AutoDebugCodeActionsProvider } from './ide/codeActionsProvider'
