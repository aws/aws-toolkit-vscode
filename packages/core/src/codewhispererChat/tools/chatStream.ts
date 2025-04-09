/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Writable } from 'stream'
import { getLogger } from '../../shared/logger/logger'
import { Messenger } from '../controllers/chat/messenger/messenger'
import { ToolUse } from '@amzn/codewhisperer-streaming'
import { CommandValidation } from './executeBash'
import { Change } from 'diff'
import * as vscode from 'vscode'
import { ConversationTracker } from '../storages/conversationTracker'

/**
 * A writable stream that feeds each chunk/line to the chat UI.
 * Used for streaming tool output (like bash execution) to the chat interface.
 */
export class ChatStream extends Writable {
    private accumulatedLogs = ''
    private isCancelled = false

    public constructor(
        private readonly messenger: Messenger,
        private readonly tabID: string,
        private readonly triggerID: string,
        private readonly toolUse: ToolUse | undefined,
        private readonly validation: CommandValidation,
        private readonly changeList?: Change[],
        private readonly logger = getLogger('chatStream'),
        private readonly cancellationToken?: vscode.CancellationToken
    ) {
        super()
        this.logger.debug(`ChatStream created for tabID: ${tabID}, triggerID: ${triggerID}`)
        this.messenger.sendInitalStream(tabID, triggerID)

        // Subscribe to cancellation token if provided
        if (cancellationToken) {
            cancellationToken.onCancellationRequested(() => {
                this.isCancelled = true
                this.logger.debug(`ChatStream cancelled for tabID: ${tabID}, triggerID: ${triggerID}`)
            })
        }
    }

    override _write(chunk: Buffer, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
        // Check if the conversation has been cancelled
        if (this.isCancelled || ConversationTracker.getInstance().isTriggerCancelled(this.triggerID)) {
            this.logger.debug(`ChatStream skipping chunk due to cancellation for triggerID: ${this.triggerID}`)
            callback()
            return
        }

        const text = chunk.toString()
        this.accumulatedLogs += text
        this.logger.debug(`ChatStream received chunk: ${text}`)
        this.messenger.sendPartialToolLog(
            this.accumulatedLogs,
            this.tabID,
            this.triggerID,
            this.toolUse,
            this.validation,
            this.changeList,
            this.cancellationToken
        )
        callback()
    }

    /**
     * Explicitly cancel the stream to stop processing further chunks
     */
    public cancel(): void {
        this.isCancelled = true
    }

    override _final(callback: (error?: Error | null) => void): void {
        callback()
    }
}
