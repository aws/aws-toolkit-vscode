/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import {
    ChatMessage,
    Tool,
    ToolResult,
    ToolResultStatus,
    UserInputMessage,
    UserInputMessageContext,
} from '@amzn/codewhisperer-streaming'
import { randomUUID } from '../../shared/crypto'
import { getLogger } from '../../shared/logger/logger'
import { tools } from '../constants'

// Maximum number of messages to keep in history
const MaxConversationHistoryLength = 100

/**
 * ChatHistoryManager handles the storage and manipulation of chat history
 * for CodeWhisperer Chat sessions.
 */
export class ChatHistoryManager {
    private conversationId: string
    private tabId: string
    private history: ChatMessage[] = []
    private logger = getLogger()
    private lastUserMessage?: ChatMessage
    private tools: Tool[] = []

    constructor(tabId?: string) {
        this.conversationId = randomUUID()
        this.tabId = tabId ?? randomUUID()
        this.tools = tools
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
     * Get the tab ID
     */
    public getTabId(): string {
        return this.tabId
    }

    /**
     * Set the tab ID
     */
    public setTabId(tabId: string) {
        this.tabId = tabId
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
        this.lastUserMessage = newMessage
        if (!newMessage.userInputMessage?.content || newMessage.userInputMessage?.content.trim() === '') {
            this.logger.warn('input must not be empty when adding new messages')
        }
        this.history.push(this.formatChatHistoryMessage(this.lastUserMessage))
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
    public fixHistory(newUserMessage: ChatMessage): ChatMessage {
        // Trim the conversation history if it exceeds the maximum length
        if (this.history.length > MaxConversationHistoryLength) {
            // Find the second oldest user message without tool results
            let indexToTrim: number | undefined

            for (let i = 1; i < this.history.length; i++) {
                const message = this.history[i]
                if (message.userInputMessage) {
                    const userMessage = message.userInputMessage
                    const ctx = userMessage.userInputMessageContext
                    const hasNoToolResults = ctx && (!ctx.toolResults || ctx.toolResults.length === 0)
                    if (hasNoToolResults && userMessage.content !== '') {
                        indexToTrim = i
                        break
                    }
                }
            }
            if (indexToTrim !== undefined) {
                this.logger.debug(`Removing the first ${indexToTrim} elements in the history`)
                this.history.splice(0, indexToTrim)
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

        // If the last message from the assistant contains tool uses, ensure the next user message contains tool results

        const lastHistoryMessage = this.history[this.history.length - 1]

        if (
            lastHistoryMessage &&
            (lastHistoryMessage.assistantResponseMessage ||
                lastHistoryMessage.assistantResponseMessage !== undefined) &&
            newUserMessage
        ) {
            const toolUses = lastHistoryMessage.assistantResponseMessage.toolUses

            if (toolUses && toolUses.length > 0) {
                if (newUserMessage.userInputMessage) {
                    if (newUserMessage.userInputMessage.userInputMessageContext) {
                        const ctx = newUserMessage.userInputMessage.userInputMessageContext

                        if (!ctx.toolResults || ctx.toolResults.length === 0) {
                            ctx.toolResults = toolUses.map((toolUse) => ({
                                toolUseId: toolUse.toolUseId,
                                content: [
                                    {
                                        type: 'Text',
                                        text: 'Tool use was cancelled by the user',
                                    },
                                ],
                                status: ToolResultStatus.ERROR,
                            }))
                        }
                    } else {
                        const toolResults = toolUses.map((toolUse) => ({
                            toolUseId: toolUse.toolUseId,
                            content: [
                                {
                                    type: 'Text',
                                    text: 'Tool use was cancelled by the user',
                                },
                            ],
                            status: ToolResultStatus.ERROR,
                        }))

                        newUserMessage.userInputMessage.userInputMessageContext = {
                            shellState: undefined,
                            envState: undefined,
                            toolResults: toolResults,
                            tools: this.tools.length === 0 ? undefined : [...this.tools],
                        }

                        return newUserMessage
                    }
                }
            }
        }

        // Always return the message to fix the TypeScript error
        return newUserMessage
    }

    /**
     * Adds tool results to the conversation.
     */
    addToolResults(toolResults: ToolResult[]): void {
        const userInputMessageContext: UserInputMessageContext = {
            shellState: undefined,
            envState: undefined,
            toolResults: toolResults,
            tools: this.tools.length === 0 ? undefined : [...this.tools],
        }

        const msg: UserInputMessage = {
            content: '',
            userInputMessageContext: userInputMessageContext,
        }

        if (this.lastUserMessage?.userInputMessage) {
            this.lastUserMessage.userInputMessage = msg
        }
    }

    private formatChatHistoryMessage(message: ChatMessage): ChatMessage {
        if (message.userInputMessage !== undefined) {
            return {
                userInputMessage: {
                    ...message.userInputMessage,
                    userInputMessageContext: {
                        ...message.userInputMessage.userInputMessageContext,
                        tools: undefined,
                    },
                },
            }
        }
        return message
    }

    public clearRecentHistory(): void {
        if (this.history.length === 0) {
            return
        }

        const lastHistoryMessage = this.history[this.history.length - 1]

        if (lastHistoryMessage.userInputMessage?.userInputMessageContext) {
            this.history.pop()
        } else if (lastHistoryMessage.assistantResponseMessage) {
            this.history.splice(-2)
        }
    }
}
