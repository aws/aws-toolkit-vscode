/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * DiffAnimationHandler - Simplified for Static Diff Views Only
 *
 * This handler now only manages streaming diff functionality.
 * Static diff views are handled by the original EditorContentController approach in messages.ts
 */

import * as vscode from 'vscode'
import { ChatResult, ChatMessage, ChatUpdateParams } from '@aws/language-server-runtimes/protocol'
import { getLogger } from 'aws-core-vscode/shared'
import { StreamingDiffController } from './streamingDiffController'

export class DiffAnimationHandler implements vscode.Disposable {
    private streamingDiffController: StreamingDiffController

    // Track streaming diff sessions by tool use ID
    private streamingSessions = new Map<
        string,
        {
            toolUseId: string
            filePath: string
            originalContent: string
            startTime: number
        }
    >()

    constructor() {
        this.streamingDiffController = new StreamingDiffController()
    }

    /**
     * Process streaming ChatResult updates - simplified to only handle streaming
     */
    public async processChatResult(
        chatResult: ChatResult | ChatMessage,
        tabId: string,
        isPartialResult?: boolean
    ): Promise<void> {
        // Only handle streaming functionality here
        // Static diff views are handled by the original EditorContentController approach
        try {
            if ('type' in chatResult && chatResult.type === 'tool') {
                // Handle streaming tool messages if needed
            } else if ('additionalMessages' in chatResult && chatResult.additionalMessages) {
                // Handle additional messages if needed for streaming
            }
        } catch (error) {
            getLogger().error(`[DiffAnimationHandler] ❌ Failed to process chat result: ${error}`)
        }
    }

    /**
     * Process ChatUpdateParams - simplified
     */
    public async processChatUpdate(params: ChatUpdateParams): Promise<void> {
        // Simplified - only handle streaming updates if needed
    }

    public async startStreamingDiffSession(
        toolUseId: string,
        filePath: string,
        providedOriginalContent?: string
    ): Promise<void> {
        try {
            let originalContent = providedOriginalContent || ''

            if (!providedOriginalContent) {
                try {
                    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath))
                    originalContent = document.getText()
                } catch {
                    originalContent = ''
                }
            }

            this.streamingSessions.set(toolUseId, {
                toolUseId,
                filePath,
                originalContent,
                startTime: Date.now(),
            })

            await this.streamingDiffController.openStreamingDiffView(toolUseId, filePath, originalContent)
        } catch (error) {
            getLogger().error(`[DiffAnimationHandler] ❌ Failed to start streaming session for ${toolUseId}: ${error}`)
        }
    }

    public async startStreamingWithOriginalContent(
        toolUseId: string,
        filePath: string,
        originalContent: string
    ): Promise<void> {
        return this.startStreamingDiffSession(toolUseId, filePath, originalContent)
    }

    public async streamContentUpdate(
        toolUseId: string,
        partialContent: string,
        isFinal: boolean = false
    ): Promise<void> {
        const session = this.streamingSessions.get(toolUseId)
        if (!session) {
            return
        }

        if (!isFinal && partialContent.trim() === '') {
            return
        }

        try {
            await this.streamingDiffController.streamContentUpdate(toolUseId, partialContent, isFinal)

            if (isFinal) {
                // Clean up the session when streaming completes
                this.streamingSessions.delete(toolUseId)
                getLogger().info(
                    `[DiffAnimationHandler] 🧹 Cleaned up streaming session for ${toolUseId} after completion`
                )
            }
        } catch (error) {
            getLogger().error(`[DiffAnimationHandler] ❌ Failed to stream content for ${toolUseId}: ${error}`)

            // Clean up session on error to prevent memory leaks
            this.streamingSessions.delete(toolUseId)
            getLogger().warn(`[DiffAnimationHandler] 🧹 Cleaned up streaming session for ${toolUseId} after error`)
        }
    }

    public isStreamingActive(toolUseId: string): boolean {
        return this.streamingSessions.has(toolUseId) && this.streamingDiffController.isStreamingActive(toolUseId)
    }

    public getStreamingStats(toolUseId: string): any {
        const session = this.streamingSessions.get(toolUseId)
        const streamingStats = this.streamingDiffController.getStreamingStats(toolUseId)
        return {
            sessionExists: !!session,
            sessionDuration: session ? Date.now() - session.startTime : 0,
            filePath: session?.filePath,
            ...streamingStats,
        }
    }

    public async dispose(): Promise<void> {
        this.streamingSessions.clear()
        this.streamingDiffController.dispose()
    }
}
