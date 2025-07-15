/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

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

export class AutoDebugLspClient {
    private readonly logger = getLogger('amazonqLsp')
    private languageClient: any // LanguageClient from vscode-languageclient

    constructor(client?: any, encryptionKey?: Buffer) {
        this.languageClient = client
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
            // Use the real client - it handles the chat pipeline and UI display automatically
            const result = await realAutoDebugClient.sendChatMessage(params.message, params.eventId)
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
