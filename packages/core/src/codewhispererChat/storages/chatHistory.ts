/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { ChatMessage } from '@amzn/codewhisperer-streaming'
import { randomUUID } from '../../shared/crypto'
import { getLogger } from '../../shared/logger/logger'

// Maximum number of messages to keep in history
const MaxConversationHistoryLength = 100

/**
 * ChatHistoryManager handles the storage and manipulation of chat history
 * for CodeWhisperer Chat sessions.
 */
export class ChatHistoryManager {
    private conversationId: string
    private history: ChatMessage[] = []
    private logger = getLogger()
    private lastUserMessage?: ChatMessage

    constructor() {
        this.conversationId = randomUUID()
        this.logger.info(`Generated new conversation id: ${this.conversationId}`)
    }

    /**
     * Get the conversation ID
     */
    public getConversationId(): string {
        return this.conversationId
    }

    public setConversationId(conversationId: string) {
        this.conversationId = conversationId
    }

    /**
     * Get the full chat history
     */
    public getHistory(): ChatMessage[] {
        return [...this.history]
    }

    /**
     * Clear the conversation history
     */
    public clear(): void {
        this.history = []
        this.conversationId = ''
    }

    /**
     * Append a new user message to be sent
     */
    public appendUserMessage(newMessage: ChatMessage): void {
        this.fixHistory()
        if (!newMessage.userInputMessage?.content || newMessage.userInputMessage?.content.trim() === '') {
            this.logger.warn('input must not be empty when adding new messages')
            // const emptyMessage: ChatMessage = {
            //     ...newMessage,
            //     userInputMessage: {
            //         ...newMessage.userInputMessage,
            //         content: 'Empty user input',
            //     },
            // }
            // this.history.push(emptyMessage)
        }
        this.lastUserMessage = newMessage
        this.history.push(newMessage)
    }

    /**
     * Push an assistant message to the history
     */
    public pushAssistantMessage(newMessage: ChatMessage): void {
        if (newMessage !== undefined && this.lastUserMessage !== undefined) {
            this.logger.warn('last Message should not be defined when pushing an assistant message')
        }
        this.history.push(newMessage)
    }

    /**
     * Fixes the history to maintain the following invariants:
     * 1. The history length is <= MAX_CONVERSATION_HISTORY_LENGTH. Oldest messages are dropped.
     * 2. The first message is from the user. Oldest messages are dropped if needed.
     * 3. The last message is from the assistant. The last message is dropped if it is from the user.
     * 4. If the last message is from the assistant and it contains tool uses, and a next user
     *    message is set without tool results, then the user message will have cancelled tool results.
     */
    public fixHistory(): void {
        // Trim the conversation history if it exceeds the maximum length
        if (this.history.length > MaxConversationHistoryLength) {
            // Find the second oldest user message to be the new starting point
            const secondUserMessageIndex = this.history
                .slice(1) // Skip the first message which might be from the user
                .findIndex((msg) => !msg.userInputMessage?.content || msg.userInputMessage?.content.trim() === '')

            if (secondUserMessageIndex !== -1) {
                // +1 because we sliced off the first element
                this.logger.debug(`Removing the first ${secondUserMessageIndex + 1} elements in the history`)
                this.history = this.history.slice(secondUserMessageIndex + 1)
            } else {
                this.logger.debug('No valid starting user message found in the history, clearing')
                this.history = []
            }
        }

        // Ensure the last message is from the assistant

        if (this.history.length > 0 && this.history[this.history.length - 1].userInputMessage !== undefined) {
            this.logger.debug('Last message in history is from the user, dropping')
            this.history.pop()
        }

        // TODO: If the last message from the assistant contains tool uses, ensure the next user message contains tool results
    }
}
