/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { LanguageClient } from 'vscode-languageclient'
import { getLogger } from 'aws-core-vscode/shared'
import { ChatResult } from '@aws/language-server-runtimes-types'
import { focusAmazonQPanel } from '../lsp/chat/commands'

/**
 * AutoDebug LSP client that uses the regular Amazon Q chat pipeline
 * This ensures the response appears in the chat UI and can be processed by the language server
 */
export class AutoDebugLspClient {
    private readonly logger = getLogger('amazonqLsp')

    public constructor(private readonly client: LanguageClient) {
        this.logger.debug('AutoDebugLspClient: Initialized using regular Amazon Q chat pipeline')
    }

    /**
     * Sends a chat message using webview postMessage - the correct approach
     * This uses the same method as explainIssue command which works properly
     */
    public async sendChatMessage(message: string, eventId: string): Promise<ChatResult> {
        try {
            // Get the webview provider from global storage (set during activation)
            const amazonQChatViewProvider = (global as any).amazonQChatViewProvider

            if (!amazonQChatViewProvider) {
                this.logger.error('AutoDebugLspClient: Amazon Q Chat View Provider not found')
                throw new Error('Amazon Q Chat View Provider not available')
            }
            // Focus Amazon Q panel first using the correct function
            await focusAmazonQPanel()

            // Wait for panel to focus
            await new Promise((resolve) => setTimeout(resolve, 200))
            // Send message using the same pattern as explainIssue command
            await amazonQChatViewProvider.webview?.postMessage({
                command: 'sendToPrompt',
                params: {
                    selection: '',
                    triggerType: 'autoDebug',
                    prompt: {
                        prompt: message, // what gets sent to the user
                        escapedPrompt: message, // what gets sent to the backend
                    },
                    autoSubmit: true, // Automatically submit the message
                },
            })
            return {
                type: 'answer',
                body: 'AutoDebug message sent successfully',
                messageId: eventId,
            } as ChatResult
        } catch (error) {
            this.logger.error('AutoDebugLspClient: ❌ Error using webview postMessage: %s', error)

            // Fallback: Show message to user for manual sending
            try {
                const vscode = require('vscode')

                // Focus the chat panel using the correct function
                await focusAmazonQPanel()

                // Show the message to the user and let them send it manually
                const choice = await vscode.window.showInformationMessage(
                    `🔧 AutoDebug detected errors and wants to send this message to Amazon Q:\n\n${message.substring(0, 200)}...`,
                    'Copy & Send Manually',
                    'Cancel'
                )

                if (choice === 'Copy & Send Manually') {
                    // Copy message to clipboard so user can paste it
                    await vscode.env.clipboard.writeText(message)
                    vscode.window.showInformationMessage(
                        'AutoDebug message copied to clipboard. Please paste it in Amazon Q chat and press Enter.'
                    )
                }

                return {
                    type: 'answer',
                    body: 'AutoDebug message handled via user fallback',
                    messageId: eventId,
                } as ChatResult
            } catch (fallbackError) {
                this.logger.error('AutoDebugLspClient: Fallback also failed: %s', fallbackError)
                throw error
            }
        }
    }

    /**
     * Checks if the language client is available
     */
    public isAvailable(): boolean {
        return this.client !== undefined && this.client.needsStart() === false
    }
}
