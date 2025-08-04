/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { getLogger, placeholder } from 'aws-core-vscode/shared'
import { focusAmazonQPanel } from 'aws-core-vscode/codewhispererChat'

export class AutoDebugLspClient {
    private readonly logger = getLogger()
    private static chatViewProvider: any // AmazonQChatViewProvider instance

    /**
     * Sets the chat view provider instance (called during activation)
     */
    public static setChatViewProvider(provider: any): void {
        AutoDebugLspClient.chatViewProvider = provider
    }

    public async sendChatMessage(params: { message: string; triggerType: string; eventId: string }): Promise<boolean> {
        try {
            // Ensure the chat view provider and webview are available
            await this.ensureWebviewReady()

            // Get the webview provider from the static reference
            const amazonQChatViewProvider = AutoDebugLspClient.chatViewProvider

            if (!amazonQChatViewProvider?.webview) {
                this.logger.error(
                    'AutoDebugLspClient: Amazon Q Chat View Provider webview not available after initialization'
                )
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
        }
    }

    /**
     * Ensures that the chat view provider and its webview are ready for use
     */
    private async ensureWebviewReady(): Promise<void> {
        if (!AutoDebugLspClient.chatViewProvider) {
            await focusAmazonQPanel.execute(placeholder, 'autoDebug')
            // wait 1 second for focusAmazonQPanel to finish
            await new Promise((resolve) => setTimeout(resolve, 500))
        }

        // Now ensure the webview is created
        if (!AutoDebugLspClient.chatViewProvider.webview) {
            await focusAmazonQPanel.execute(placeholder, 'autoDebug')
            // wait 1 second for webview to be created
            await new Promise((resolve) => setTimeout(resolve, 500))
        }
    }
}
