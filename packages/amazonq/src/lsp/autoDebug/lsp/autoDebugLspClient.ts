/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLogger, placeholder } from 'aws-core-vscode/shared'
import { focusAmazonQPanel } from 'aws-core-vscode/codewhispererChat'
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

export class AutoDebugLspClient {
    private readonly logger = getLogger()
    private languageClient: any // LanguageClient from vscode-languageclient
    private static chatViewProvider: any // AmazonQChatViewProvider instance

    constructor(client?: any, encryptionKey?: Buffer) {
        this.languageClient = client
    }

    /**
     * Sets the chat view provider instance (called during activation)
     */
    public static setChatViewProvider(provider: any): void {
        AutoDebugLspClient.chatViewProvider = provider
    }

    /**
     * Sets the language client instance
     */
    public setLanguageClient(client: any): void {
        this.languageClient = client
    }
    /**
     * Gets the language client instance
     */
    public getLanguageClient(): any {
        return this.languageClient
    }

    public async sendChatMessage(params: { message: string; triggerType: string; eventId: string }): Promise<boolean> {
        try {
            // Get the webview provider from the static reference
            const amazonQChatViewProvider = AutoDebugLspClient.chatViewProvider

            if (!amazonQChatViewProvider?.webview) {
                this.logger.error('AutoDebugLspClient: Amazon Q Chat View Provider not available')
                return false
            }

            // Focus Amazon Q panel first using the imported function
            await focusAmazonQPanel.execute(placeholder, 'autoDebug')

            // Wait for panel to focus
            await new Promise((resolve) => setTimeout(resolve, 200))
            await amazonQChatViewProvider.webview.postMessage({
                command: 'sendToPrompt',
                params: {
                    selection: '',
                    triggerType: 'autoDebug',
                    prompt: {
                        prompt: params.message, // what gets sent to the user
                        escapedPrompt: params.message, // what gets sent to the backend
                    },
                    autoSubmit: true, // Automatically submit the message
                },
            })
            return true
        } catch (error) {
            this.logger.error('AutoDebugLspClient: Error sending message via webview: %s', error)
            return false
            // Fallback: Copy to clipboard and show notification
        }
    }

    /**
     * Requests automatic bug fixes from the language server
     */
    public async requestAutoFix(params: AutoDebugFixParams): Promise<AutoDebugFixResult> {
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
}
