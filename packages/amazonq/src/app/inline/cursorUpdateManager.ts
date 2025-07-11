/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { LanguageClient } from 'vscode-languageclient'
import { getLogger } from 'aws-core-vscode/shared'
import { globals } from 'aws-core-vscode/shared'
import { AmazonQInlineCompletionItemProvider } from './completion'
import { CodeSuggestionsState } from 'aws-core-vscode/codewhisperer'

// Configuration section for cursor updates
export const cursorUpdateConfigurationSection = 'aws.q.cursorUpdate'

/**
 * Interface for recording completion requests
 */
export interface ICursorUpdateRecorder {
    recordCompletionRequest(): void
}

/**
 * Manages periodic cursor position updates for Next Edit Prediction
 */
export class CursorUpdateManager implements vscode.Disposable, ICursorUpdateRecorder {
    private readonly logger = getLogger('amazonqLsp')
    private updateIntervalMs = 250
    private updateTimer?: NodeJS.Timeout
    private lastPosition?: vscode.Position
    private lastDocumentUri?: string
    private lastSentPosition?: vscode.Position
    private lastSentDocumentUri?: string
    private isActive = false
    private lastRequestTime = 0
    private autotriggerStateDisposable?: vscode.Disposable

    constructor(
        private readonly languageClient: LanguageClient,
        private readonly inlineCompletionProvider?: AmazonQInlineCompletionItemProvider
    ) {
        // Listen for autotrigger state changes to enable/disable the timer
        this.autotriggerStateDisposable = CodeSuggestionsState.instance.onDidChangeState((isEnabled: boolean) => {
            if (isEnabled && this.isActive) {
                // If autotrigger is enabled and we're active, ensure timer is running
                this.setupUpdateTimer()
            } else {
                // If autotrigger is disabled, clear the timer but keep isActive state
                this.clearUpdateTimer()
            }
        })
    }

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
            }
        } catch (error) {
            this.logger.warn(`Failed to get cursor update configuration from server: ${error}`)
        }

        this.isActive = true
        if (CodeSuggestionsState.instance.isSuggestionsEnabled()) {
            this.setupUpdateTimer()
        }
    }

    /**
     * Stop tracking cursor positions and sending updates
     */
    public stop(): void {
        this.isActive = false
        this.clearUpdateTimer()
    }

    /**
     * Update the current cursor position
     */
    public updatePosition(position: vscode.Position, documentUri: string): void {
        // If the document changed, set the last sent position to the current position
        // This prevents triggering an immediate recommendation when switching tabs
        if (this.lastDocumentUri !== documentUri) {
            this.lastSentPosition = position.with() // Create a copy
            this.lastSentDocumentUri = documentUri
        }

        this.lastPosition = position.with() // Create a copy
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

        this.updateTimer = globals.clock.setInterval(async () => {
            await this.sendCursorUpdate()
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
     * Creates a cancellation token source
     * This method exists to make testing easier by allowing it to be stubbed
     */
    // private createCancellationTokenSource(): vscode.CancellationTokenSource {
    //     return new vscode.CancellationTokenSource()
    // }

    /**
     * Request LSP generate a completion for the current cursor position.
     */
    private async sendCursorUpdate(): Promise<void> {
        // Don't send an update if a regular request was made recently
        const now = globals.clock.Date.now()
        if (now - this.lastRequestTime < this.updateIntervalMs) {
            return
        }

        const editor = vscode.window.activeTextEditor
        if (!editor || editor.document.uri.toString() !== this.lastDocumentUri) {
            return
        }

        // Don't send an update if the position hasn't changed since the last update
        if (
            this.lastSentPosition &&
            this.lastPosition &&
            this.lastSentDocumentUri === this.lastDocumentUri &&
            this.lastSentPosition.line === this.lastPosition.line &&
            this.lastSentPosition.character === this.lastPosition.character
        ) {
            return
        }

        // Only proceed if we have a valid position and provider
        if (this.lastPosition && this.inlineCompletionProvider) {
            const position = this.lastPosition.with() // Create a copy

            // Call the inline completion provider instead of directly calling getAllRecommendations
            try {
                // await this.inlineCompletionProvider.provideInlineCompletionItems(
                //     editor.document,
                //     position,
                //     {
                //         triggerKind: vscode.InlineCompletionTriggerKind.Automatic,
                //         selectedCompletionInfo: undefined,
                //     },
                //     this.createCancellationTokenSource().token,
                //     { emitTelemetry: false, showUi: false }
                // )

                // Only update the last sent position after successfully sending the request
                this.lastSentPosition = position
                this.lastSentDocumentUri = this.lastDocumentUri
            } catch (error) {
                this.logger.error(`Error sending cursor update: ${error}`)
            }
        }
    }

    /**
     * Dispose of resources
     */
    public dispose(): void {
        // Dispose of the autotrigger state change listener
        if (this.autotriggerStateDisposable) {
            this.autotriggerStateDisposable.dispose()
            this.autotriggerStateDisposable = undefined
        }

        this.stop()
    }
}
