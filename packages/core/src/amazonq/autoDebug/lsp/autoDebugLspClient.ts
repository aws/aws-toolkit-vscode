/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { getLogger } from '../../../shared/logger/logger'
import { Problem } from '../diagnostics/problemDetector'
import { ErrorContext } from '../diagnostics/errorContext'

/**
 * Request types for auto debug LSP communication
 */
export const autoDebugFixRequestType = {
    method: 'amazonq/autoDebugFix',
} as const

export const autoDebugAnalyzeRequestType = {
    method: 'amazonq/autoDebugAnalyze',
} as const

export interface AutoDebugFixParams {
    problems: Problem[]
    errorContexts: ErrorContext[]
    filePath: string
    fileContent: string
    autoApply?: boolean
}

export interface AutoDebugAnalyzeParams {
    problems: Problem[]
    errorContexts: ErrorContext[]
    filePath: string
    fileContent: string
}

export interface AutoDebugFixResult {
    success: boolean
    fixes: AutoDebugFix[]
    explanation?: string
    error?: string
}

export interface AutoDebugAnalyzeResult {
    success: boolean
    analysis: string
    suggestions: AutoDebugSuggestion[]
    error?: string
}

export interface AutoDebugFix {
    range: {
        start: { line: number; character: number }
        end: { line: number; character: number }
    }
    newText: string
    description: string
    confidence: 'high' | 'medium' | 'low'
}

export interface AutoDebugSuggestion {
    description: string
    severity: 'error' | 'warning' | 'info'
    range?: {
        start: { line: number; character: number }
        end: { line: number; character: number }
    }
}

/**
 * LSP client for communicating with the language server for auto debug functionality
 * This class now delegates to the real AutoDebugLspClient in the amazonq package
 */
export class AutoDebugLspClient {
    private readonly logger = getLogger('amazonqLsp')
    private languageClient: any // LanguageClient from vscode-languageclient

    constructor(client?: any, encryptionKey?: Buffer) {
        this.logger.debug('AutoDebugLspClient: Initializing LSP client that delegates to amazonq package')
        this.languageClient = client

        if (client) {
            this.logger.debug('AutoDebugLspClient: Language client provided in constructor')
        }
        if (encryptionKey) {
            this.logger.debug('AutoDebugLspClient: Encryption key provided in constructor')
        }
    }

    /**
     * Sets the language client instance
     */
    public setLanguageClient(client: any): void {
        this.logger.debug('AutoDebugLspClient: Setting language client - %s', client ? 'provided' : 'null/undefined')
        this.languageClient = client
        this.logger.debug('AutoDebugLspClient: Language client set successfully')
    }

    /**
     * Sets the encryption key for LSP communication
     */
    public setEncryptionKey(encryptionKey: Buffer): void {
        this.logger.debug('AutoDebugLspClient: Setting encryption key (delegated - actual key set in amazonq package)')
        this.logger.debug('AutoDebugLspClient: Encryption key set successfully')
    }

    /**
     * Gets the language client instance
     */
    public getLanguageClient(): any {
        return this.languageClient
    }

    /**
     * Sends a chat message using the real AutoDebugLspClient from amazonq package
     * This uses the regular Amazon Q chat pipeline - response will appear in chat UI automatically
     */
    public async sendChatMessage(params: { message: string; triggerType: string; eventId: string }): Promise<boolean> {
        try {
            // Get the real AutoDebugLspClient from the amazonq package
            const realAutoDebugClient = (global as any).autoDebugLspClient

            if (!realAutoDebugClient) {
                this.logger.error(
                    'AutoDebugLspClient: Real AutoDebugLspClient not found - it should be activated by amazonq package'
                )
                return false
            }

            this.logger.info(
                'AutoDebugLspClient: Found real AutoDebugLspClient, sending message using regular chat pipeline'
            )

            // Use the real client - it handles the chat pipeline and UI display automatically
            const result = await realAutoDebugClient.sendChatMessage(params.message, params.eventId)

            this.logger.info('AutoDebugLspClient: ✅ Message sent successfully using real AutoDebugLspClient')
            // Return success - the chat pipeline handles everything else automatically
            return !!result
        } catch (error) {
            this.logger.error('AutoDebugLspClient: ❌ Error using real AutoDebugLspClient: %s', error)
            return false
        }
    }

    /**
     * Requests automatic bug fixes from the language server
     */
    public async requestAutoFix(params: AutoDebugFixParams): Promise<AutoDebugFixResult> {
        this.logger.debug('AutoDebugLspClient: Requesting auto fix for %d problems', params.problems.length)

        if (!this.languageClient) {
            this.logger.warn('AutoDebugLspClient: Language client not initialized')
            return {
                success: false,
                fixes: [],
                error: 'Language client not initialized',
            }
        }

        try {
            // Use executeCommand instead of sendRequest
            const result = (await this.languageClient.sendRequest('workspace/executeCommand', {
                command: 'aws/autoDebug/fix',
                arguments: [params],
            })) as AutoDebugFixResult

            this.logger.debug('AutoDebugLspClient: Received fix result with %d fixes', result.fixes?.length || 0)
            return result
        } catch (error) {
            this.logger.error('AutoDebugLspClient: Error requesting auto fix: %s', error)
            return {
                success: false,
                fixes: [],
                error: error instanceof Error ? error.message : 'Unknown error',
            }
        }
    }

    /**
     * Requests problem analysis from the language server
     */
    public async requestAnalysis(params: AutoDebugAnalyzeParams): Promise<AutoDebugAnalyzeResult> {
        this.logger.debug('AutoDebugLspClient: Requesting analysis for %d problems', params.problems.length)

        if (!this.languageClient) {
            this.logger.warn('AutoDebugLspClient: Language client not initialized')
            return {
                success: false,
                analysis: '',
                suggestions: [],
                error: 'Language client not initialized',
            }
        }

        try {
            // Use executeCommand instead of sendRequest
            const result = (await this.languageClient.sendRequest('workspace/executeCommand', {
                command: 'aws/autoDebug/analyze',
                arguments: [params],
            })) as AutoDebugAnalyzeResult

            this.logger.debug('AutoDebugLspClient: Received analysis result')
            return result
        } catch (error) {
            this.logger.error('AutoDebugLspClient: Error requesting analysis: %s', error)
            return {
                success: false,
                analysis: '',
                suggestions: [],
                error: error instanceof Error ? error.message : 'Unknown error',
            }
        }
    }

    /**
     * Applies fixes to the workspace
     */
    public async applyFixes(fixes: AutoDebugFix[], filePath: string): Promise<boolean> {
        this.logger.debug('AutoDebugLspClient: Applying %d fixes to %s', fixes.length, filePath)

        try {
            const uri = vscode.Uri.file(filePath)
            const document = await vscode.workspace.openTextDocument(uri)

            const workspaceEdit = new vscode.WorkspaceEdit()

            // Sort fixes by position (reverse order to avoid offset issues)
            const sortedFixes = fixes.sort((a, b) => {
                if (a.range.start.line !== b.range.start.line) {
                    return b.range.start.line - a.range.start.line
                }
                return b.range.start.character - a.range.start.character
            })

            for (const fix of sortedFixes) {
                const range = new vscode.Range(
                    new vscode.Position(fix.range.start.line, fix.range.start.character),
                    new vscode.Position(fix.range.end.line, fix.range.end.character)
                )
                workspaceEdit.replace(uri, range, fix.newText)
            }

            const success = await vscode.workspace.applyEdit(workspaceEdit)

            if (success) {
                this.logger.debug('AutoDebugLspClient: Successfully applied fixes')
                // Save the document after applying fixes
                await document.save()
            } else {
                this.logger.error('AutoDebugLspClient: Failed to apply fixes')
            }

            return success
        } catch (error) {
            this.logger.error('AutoDebugLspClient: Error applying fixes: %s', error)
            return false
        }
    }

    /**
     * Checks if the language client is available and running
     */
    public isAvailable(): boolean {
        const isClientSet = this.languageClient !== undefined
        const clientState = this.languageClient?.state

        // Language client states:
        // 0 = Stopped
        // 1 = Starting
        // 2 = Running
        // 3 = Stopping
        // State 3 (Stopping) should still allow requests to complete
        const isRunning = clientState === undefined || clientState === 2 || clientState === 3

        this.logger.debug(
            'AutoDebugLspClient: Availability check - client set: %s, state: %s (%s), is running: %s',
            isClientSet,
            clientState !== undefined ? clientState : 'undefined',
            this.getStateDescription(clientState),
            isRunning
        )

        const available = isClientSet && isRunning
        this.logger.debug('AutoDebugLspClient: Overall availability: %s', available)

        return available
    }

    private getStateDescription(state: number | undefined): string {
        switch (state) {
            case 0:
                return 'Stopped'
            case 1:
                return 'Starting'
            case 2:
                return 'Running'
            case 3:
                return 'Stopping'
            default:
                return 'Unknown'
        }
    }
}
