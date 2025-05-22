/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { LanguageClient } from 'vscode-languageclient'
import { getLogger } from 'aws-core-vscode/shared'
import { globals } from 'aws-core-vscode/shared'
import { InlineCompletionTriggerKind } from 'vscode'

// Configuration section for cursor updates
export const cursorUpdateConfigurationSection = 'aws.q.cursorUpdate'

/**
 * Manages periodic cursor position updates for Next Edit Prediction
 */
export class CursorUpdateManager implements vscode.Disposable {
    private readonly logger = getLogger('amazonqLsp')
    private updateIntervalMs = 250
    private updateTimer?: NodeJS.Timeout
    private lastPosition?: vscode.Position
    private lastDocumentUri?: string
    private isActive = false
    private lastRequestTime = 0

    constructor(private readonly languageClient: LanguageClient) {}

    /**
     * Start tracking cursor positions and sending periodic updates
     */
    public async start(): Promise<void> {
        if (this.isActive) {
            return
        }

        // Request configuration from server
        try {
            const config = await this.languageClient.sendRequest('aws/getConfigurationFromServer', {
                section: cursorUpdateConfigurationSection,
            })

            if (
                config &&
                typeof config === 'object' &&
                'intervalMs' in config &&
                typeof config.intervalMs === 'number' &&
                config.intervalMs > 0
            ) {
                this.updateIntervalMs = config.intervalMs
                this.logger.debug(`Using server-provided cursor update interval: ${this.updateIntervalMs}ms`)
            } else {
                this.logger.debug(`Using default cursor update interval: ${this.updateIntervalMs}ms`)
            }
        } catch (error) {
            this.logger.warn(`Failed to get cursor update configuration from server: ${error}`)
            this.logger.debug(`Using default cursor update interval: ${this.updateIntervalMs}ms`)
        }

        this.isActive = true
        this.setupUpdateTimer()
    }

    /**
     * Stop tracking cursor positions and sending updates
     */
    public stop(): void {
        this.isActive = false
        this.clearUpdateTimer()
        this.logger.debug('CursorUpdateManager stopped')
    }

    /**
     * Update the current cursor position
     */
    public updatePosition(position: vscode.Position, documentUri: string): void {
        this.lastPosition = position
        this.lastDocumentUri = documentUri
    }

    /**
     * Record that a regular InlineCompletionWithReferences request was made
     * This will prevent cursor updates from being sent for the update interval
     */
    public recordCompletionRequest(): void {
        this.lastRequestTime = globals.clock.Date.now()
    }

    /**
     * Set up the timer for periodic cursor position updates
     */
    private setupUpdateTimer(): void {
        this.clearUpdateTimer()

        this.updateTimer = globals.clock.setInterval(() => {
            this.sendCursorUpdate()
        }, this.updateIntervalMs)
    }

    /**
     * Clear the update timer
     */
    private clearUpdateTimer(): void {
        if (this.updateTimer) {
            globals.clock.clearInterval(this.updateTimer)
            this.updateTimer = undefined
        }
    }

    /**
     * Send a cursor position update to the language server
     */
    private sendCursorUpdate(): void {
        // Only send updates if we have a position and document URI
        if (!this.lastPosition || !this.lastDocumentUri || !this.isActive) {
            return
        }

        // Don't send an update if a regular request was made recently
        const now = globals.clock.Date.now()
        if (now - this.lastRequestTime < this.updateIntervalMs) {
            return
        }

        const editor = vscode.window.activeTextEditor
        if (!editor || editor.document.uri.toString() !== this.lastDocumentUri) {
            return
        }

        // Create a standard InlineCompletionWithReferences request
        const request = {
            textDocument: {
                uri: this.lastDocumentUri,
            },
            position: {
                line: this.lastPosition.line,
                character: this.lastPosition.character,
            },
            context: {
                triggerKind: InlineCompletionTriggerKind.Automatic,
            },
        }

        // Send the request to the language server
        this.languageClient.sendRequest('aws/inlineCompletionWithReferences', request).catch((error) => {
            // Ignore errors for cursor updates to avoid flooding the console
            this.logger.debug(`Error sending cursor update: ${error}`)
        })
    }

    /**
     * Dispose of resources
     */
    public dispose(): void {
        this.stop()
    }
}
