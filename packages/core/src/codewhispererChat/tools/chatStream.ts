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
import { ConversationTracker } from '../storages/conversationTracker'
import { ChatSession } from '../clients/chat/v0/chat'
import { i18n } from '../../shared/i18n-helper'

/**
 * A writable stream that feeds each chunk/line to the chat UI.
 * Used for streaming tool output (like bash execution) to the chat interface.
 */
export class ChatStream extends Writable {
    private accumulatedLogs = ''

    public constructor(
        private readonly messenger: Messenger,
        private readonly tabID: string,
        private readonly triggerID: string,
        private readonly toolUse: ToolUse | undefined,
        private readonly session: ChatSession,
        private readonly messageIdToUpdate: string | undefined,
        // emitEvent decides to show the streaming message or read/list directory tool message to the user.
        private readonly emitEvent: boolean,
        private readonly validation: CommandValidation,
        private readonly isReadorList: boolean,
        private readonly changeList?: Change[],
        private readonly logger = getLogger('chatStream')
    ) {
        super()
        this.logger.debug(
            `ChatStream created for tabID: ${tabID}, triggerID: ${triggerID}, readFiles: ${session.readFiles}, emitEvent to mynahUI: ${emitEvent}`
        )
        if (!emitEvent) {
            return
        }
        if (validation.requiresAcceptance) {
            this.messenger.sendDirectiveMessage(
                tabID,
                triggerID,
                i18n('AWS.amazonq.chat.directive.runCommandToProceed')
            )
        }
        // For FsRead and ListDirectory tools If messageIdToUpdate is undefined, we need to first create an empty message with messageId so it can be updated later
        if (isReadorList && !messageIdToUpdate) {
            this.messenger.sendInitialToolMessage(tabID, triggerID, toolUse?.toolUseId)
        } else {
            this.messenger.sendInitalStream(tabID, triggerID)
        }
    }

    override _write(chunk: Buffer, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
        // Check if the conversation has been cancelled
        if (ConversationTracker.getInstance().isTriggerCancelled(this.triggerID)) {
            callback()
            return
        }

        const text = chunk.toString()
        this.accumulatedLogs += text
        this.logger.debug(
            `ChatStream received chunk: ${text}, emitEvent to mynahUI: ${this.emitEvent}, isReadorList tool: ${this.isReadorList}`
        )
        this.messenger.sendPartialToolLog(
            this.accumulatedLogs,
            this.tabID,
            this.triggerID,
            this.toolUse,
            this.session,
            this.messageIdToUpdate,
            this.validation,
            this.changeList
        )
        callback()
    }

    override _final(callback: (error?: Error | null) => void): void {
        callback()
    }
}
