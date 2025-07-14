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

    public async processChatResult(
        chatResult: ChatResult | ChatMessage,
        tabId: string,
        isPartialResult?: boolean
    ): Promise<void> {
        try {
            if ('type' in chatResult && chatResult.type === 'tool') {
                await this.processChatMessage(chatResult as ChatMessage, tabId)
            } else if ('additionalMessages' in chatResult && chatResult.additionalMessages) {
                for (const message of chatResult.additionalMessages) {
                    await this.processChatMessage(message, tabId)
                }
            }
        } catch (error) {
            getLogger().error(`[ChatProcessor] ❌ Failed to process chat result: ${error}`)
        }
    }

    private async processChatMessage(message: ChatMessage, tabId: string): Promise<void> {
        if (!message.messageId) {
            return
        }

        const messageKey = `${message.messageId}_${message.type}`
        if (this.processedMessages.has(messageKey)) {
            return
        }
        this.processedMessages.add(messageKey)

        if (message.type === 'tool' && message.messageId.startsWith('progress_')) {
            await this.processFsWritePreparation(message, tabId)
        }
    }

    private async processFsWritePreparation(message: ChatMessage, tabId: string): Promise<void> {
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

        const toolUseId = message.messageId!.replace('progress_', '')
        const { content: originalContent, exists: fileExists } =
            await this.fileSystemManager.captureFileContent(filePath)

        const pendingWrite: PendingFileWrite = {
            filePath,
            originalContent,
            toolUseId,
            timestamp: Date.now(),
        }

        try {
            await this.fileSystemManager.prepareFileForWrite(filePath, fileExists)
            await this.onFileWritePreparation(pendingWrite)
        } catch (error) {
            getLogger().error(`[ChatProcessor] ❌ Failed to prepare file write: ${error}`)
            throw error
        }
    }

    public async processChatUpdate(params: ChatUpdateParams): Promise<void> {
        if (params.data?.messages) {
            for (const message of params.data.messages) {
                await this.processChatMessage(message, params.tabId)
            }
        }
    }

    public clearProcessedMessages(): void {
        if (this.processedMessages.size > 1000) {
            this.processedMessages.clear()
        }
    }

    public clearAll(): void {
        this.processedMessages.clear()
    }
}
