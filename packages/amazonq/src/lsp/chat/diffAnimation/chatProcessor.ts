/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatResult, ChatMessage, ChatUpdateParams } from '@aws/language-server-runtimes/protocol'
import { getLogger } from 'aws-core-vscode/shared'
import { PendingFileWrite } from './types'
import { FileSystemManager } from './fileSystemManager'

export class ChatProcessor {
    // Track processed messages to avoid duplicates
    private processedMessages = new Set<string>()

    constructor(
        private fileSystemManager: FileSystemManager,
        private onFileWritePreparation: (pendingWrite: PendingFileWrite) => Promise<void>
    ) {}

    /**
     * Process streaming ChatResult updates
     */
    public async processChatResult(
        chatResult: ChatResult | ChatMessage,
        tabId: string,
        isPartialResult?: boolean
    ): Promise<void> {
        getLogger().info(`[ChatProcessor] 📨 Processing ChatResult for tab ${tabId}, isPartial: ${isPartialResult}`)

        try {
            // Handle both ChatResult and ChatMessage types
            if ('type' in chatResult && chatResult.type === 'tool') {
                // This is a ChatMessage
                await this.processChatMessage(chatResult as ChatMessage, tabId)
            } else if ('additionalMessages' in chatResult && chatResult.additionalMessages) {
                // This is a ChatResult with additional messages
                for (const message of chatResult.additionalMessages) {
                    await this.processChatMessage(message, tabId)
                }
            }
        } catch (error) {
            getLogger().error(`[ChatProcessor] ❌ Failed to process chat result: ${error}`)
        }
    }

    /**
     * Process individual chat messages
     */
    private async processChatMessage(message: ChatMessage, tabId: string): Promise<void> {
        if (!message.messageId) {
            return
        }

        // Deduplicate messages
        const messageKey = `${message.messageId}_${message.type}`
        if (this.processedMessages.has(messageKey)) {
            getLogger().info(`[ChatProcessor] ⏭️ Already processed message: ${messageKey}`)
            return
        }
        this.processedMessages.add(messageKey)

        // Check for fsWrite tool preparation (when tool is about to execute)
        if (message.type === 'tool' && message.messageId.startsWith('progress_')) {
            await this.processFsWritePreparation(message, tabId)
        }
    }

    /**
     * Process fsWrite preparation - capture content BEFORE file is written
     */
    private async processFsWritePreparation(message: ChatMessage, tabId: string): Promise<void> {
        // Cast to any to access properties that might not be in the type definition
        const messageAny = message as any

        const fileList = messageAny.header?.fileList
        if (!fileList?.filePaths || fileList.filePaths.length === 0) {
            return
        }

        const fileName = fileList.filePaths[0]
        const fileDetails = fileList.details?.[fileName]

        if (!fileDetails?.description) {
            return
        }

        const filePath = await this.fileSystemManager.resolveFilePath(fileDetails.description)
        if (!filePath) {
            return
        }

        // Extract toolUseId from progress message
        const toolUseId = message.messageId!.replace('progress_', '')

        getLogger().info(`[ChatProcessor] 🎬 Preparing for fsWrite: ${filePath} (toolUse: ${toolUseId})`)

        // Capture current content IMMEDIATELY before the write happens
        const { content: originalContent, exists: fileExists } =
            await this.fileSystemManager.captureFileContent(filePath)

        // Store pending write info
        const pendingWrite: PendingFileWrite = {
            filePath,
            originalContent,
            toolUseId,
            timestamp: Date.now(),
        }

        try {
            // Prepare file for writing
            await this.fileSystemManager.prepareFileForWrite(filePath, fileExists)

            // Notify handler about the pending write
            await this.onFileWritePreparation(pendingWrite)
        } catch (error) {
            getLogger().error(`[ChatProcessor] ❌ Failed to prepare file write: ${error}`)
            throw error
        }
    }

    /**
     * Process ChatUpdateParams
     */
    public async processChatUpdate(params: ChatUpdateParams): Promise<void> {
        getLogger().info(`[ChatProcessor] 🔄 Processing chat update for tab ${params.tabId}`)

        if (params.data?.messages) {
            for (const message of params.data.messages) {
                await this.processChatMessage(message, params.tabId)
            }
        }
    }

    /**
     * Clear processed messages cache
     */
    public clearProcessedMessages(): void {
        if (this.processedMessages.size > 1000) {
            const oldSize = this.processedMessages.size
            this.processedMessages.clear()
            getLogger().info(`[ChatProcessor] 🧹 Cleared ${oldSize} processed messages`)
        }
    }

    /**
     * Clear all caches
     */
    public clearAll(): void {
        this.processedMessages.clear()
    }
}
