/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import Loki from 'lokijs'
import * as vscode from 'vscode'
import { TabType } from '../../../amazonq/webview/ui/storages/tabsStorage'
import { ChatItemType, DetailedListItemGroup } from '@aws/mynah-ui'
import {
    ClientType,
    Conversation,
    FileSystemAdapter,
    groupTabsByDate,
    Message,
    Tab,
    TabCollection,
    updateOrCreateConversation,
} from './util'
import crypto from 'crypto'
import path from 'path'
import { fs } from '../../fs/fs'
import { getLogger } from '../../logger/logger'
import { ChatMessage, ToolResultStatus } from '@amzn/codewhisperer-streaming'
import { CWCTelemetryHelper } from '../../../codewhispererChat/controllers/chat/telemetryHelper'

// Maximum number of characters to keep in history
const MaxConversationHistoryCharacters = 600_000
// Maximum number of messages to keep in history
const MaxConversationHistoryMessages = 250

/**
 * A singleton database class that manages chat history persistence using LokiJS.
 * This class handles storage and retrieval of chat conversations, messages, and tab states
 * for the Amazon Q VS Code extension.
 *
 * The database is stored in the user's home directory under .aws/amazonq/history
 * with a unique filename based on the workspace identifier.
 *
 *
 * @singleton
 * @class
 */

export class Database {
    private static instance: Database | undefined = undefined
    private db: Loki
    private logger = getLogger('chatHistoryDb')
    /**
     * Keep track of which open tabs have a corresponding history entry. Maps tabIds to historyIds
     */
    private historyIdMapping: Map<string, string> = new Map()
    private dbDirectory: string
    initialized: boolean = false

    constructor() {
        this.dbDirectory = path.join(fs.getUserHomeDir(), '.aws/amazonq/history')
        const workspaceId = this.getWorkspaceIdentifier()
        const dbName = `chat-history-${workspaceId}.json`

        this.logger.debug(`Initializing database at ${this.dbDirectory}/${dbName}`)

        this.db = new Loki(dbName, {
            adapter: new FileSystemAdapter(this.dbDirectory),
            autosave: true,
            autoload: true,
            autoloadCallback: () => this.databaseInitialize(),
            autosaveInterval: 1000,
            persistenceMethod: 'fs',
        })
    }

    public static getInstance(): Database {
        if (!Database.instance) {
            Database.instance = new Database()
        }
        return Database.instance
    }

    setHistoryIdMapping(tabId: string, historyId: string) {
        this.logger.debug(`[Setting historyIdMapping: tabId=${tabId}, historyId=${historyId}`)
        this.historyIdMapping.set(tabId, historyId)
    }

    getWorkspaceIdentifier() {
        // Case 1: .code-workspace file (saved workspace)
        const workspace = vscode.workspace.workspaceFile
        if (workspace) {
            return crypto.createHash('md5').update(workspace.fsPath).digest('hex')
        }

        // Case 2: Multi-root workspace (unsaved)
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 1) {
            // Create hash from all folder paths combined
            const pathsString = vscode.workspace.workspaceFolders
                .map((folder) => folder.uri.fsPath)
                .sort() // Sort to ensure consistent hash regardless of folder order
                .join('|')
            return crypto.createHash('md5').update(pathsString).digest('hex')
        }

        // Case 3: Single folder workspace
        if (vscode.workspace.workspaceFolders?.[0]) {
            return crypto.createHash('md5').update(vscode.workspace.workspaceFolders[0].uri.fsPath).digest('hex')
        }

        // Case 4: No workspace
        this.logger.debug(`No workspace found, using default identifier: 'no-workspace'`)
        return 'no-workspace'
    }

    async databaseInitialize() {
        let entries = this.db.getCollection(TabCollection)
        if (entries === null) {
            this.logger.info(`Creating new tabs collection`)
            entries = this.db.addCollection(TabCollection, {
                unique: ['historyId'],
                indices: ['updatedAt', 'isOpen'],
            })
        }
        this.initialized = true
    }

    getOpenTabs() {
        if (this.initialized) {
            const collection = this.db.getCollection<Tab>(TabCollection)
            return collection.find({ isOpen: true })
        }
    }

    getTab(historyId: string) {
        if (this.initialized) {
            const collection = this.db.getCollection<Tab>(TabCollection)
            return collection.findOne({ historyId })
        }
    }

    // If conversation is open, return its tabId, else return undefined
    getOpenTabId(historyId: string) {
        const selectedTab = this.getTab(historyId)
        if (selectedTab?.isOpen) {
            for (const [tabId, id] of this.historyIdMapping) {
                if (id === historyId) {
                    return tabId
                }
            }
        }
        return undefined
    }

    clearTab(tabId: string) {
        if (this.initialized) {
            const tabCollection = this.db.getCollection<Tab>(TabCollection)
            const historyId = this.historyIdMapping.get(tabId)
            this.logger.info(`Clearing tab: tabId=${tabId}, historyId=${historyId || 'undefined'}`)
            if (historyId) {
                tabCollection.findAndRemove({ historyId })
                this.logger.debug(`Removed tab with historyId=${historyId} from collection`)
            }
            this.historyIdMapping.delete(tabId)
            this.logger.debug(`Removed tabId=${tabId} from historyIdMapping`)
        }
    }

    updateTabOpenState(tabId: string, isOpen: boolean) {
        if (this.initialized) {
            const tabCollection = this.db.getCollection<Tab>(TabCollection)
            const historyId = this.historyIdMapping.get(tabId)
            this.logger.info(
                `Updating tab open state: tabId=${tabId}, historyId=${historyId || 'undefined'}, isOpen=${isOpen}`
            )
            if (historyId) {
                tabCollection.findAndUpdate({ historyId }, (tab: Tab) => {
                    tab.isOpen = isOpen
                    return tab
                })
                this.logger.debug(`Updated tab open state in collection`)
                if (!isOpen) {
                    this.historyIdMapping.delete(tabId)
                    this.logger.debug(`Removed tabId=${tabId} from historyIdMapping`)
                }
            }
        }
    }

    searchMessages(filter: string): DetailedListItemGroup[] {
        let searchResults: DetailedListItemGroup[] = []
        if (this.initialized) {
            if (!filter) {
                this.logger.info(`Empty search filter, returning all history`)
                return this.getHistory()
            }

            this.logger.info(`Searching messages with filter: "${filter}"`)
            const searchTermLower = filter.toLowerCase()
            const tabCollection = this.db.getCollection<Tab>(TabCollection)
            const tabs = tabCollection.find()
            const filteredTabs = tabs.filter((tab: Tab) => {
                return tab.conversations.some((conversation: Conversation) => {
                    return conversation.messages.some((message: Message) => {
                        return message.body?.toLowerCase().includes(searchTermLower)
                    })
                })
            })
            this.logger.info(`Found ${filteredTabs.length} matching tabs`)
            searchResults = groupTabsByDate(filteredTabs)
        }
        if (searchResults.length === 0) {
            this.logger.info(`No search results found, returning default message`)
            searchResults = [{ children: [{ description: 'No matches found' }] }]
        }
        return searchResults
    }

    /**
     * Get messages for specified tabId
     * @param tabId The ID of the tab to get messages from
     * @param numMessages Optional number of most recent messages to return. If not provided, returns all messages.
     */
    getMessages(tabId: string, numMessages?: number): Message[] {
        if (this.initialized) {
            const tabCollection = this.db.getCollection<Tab>(TabCollection)
            const historyId = this.historyIdMapping.get(tabId)
            this.logger.info(
                `Getting messages: tabId=${tabId}, historyId=${historyId || 'undefined'}, numMessages=${numMessages || 'all'}`
            )
            const tabData = historyId ? tabCollection.findOne({ historyId }) : undefined
            if (tabData) {
                const allMessages = tabData.conversations.flatMap((conversation: Conversation) => conversation.messages)
                if (numMessages !== undefined) {
                    return allMessages.slice(-numMessages)
                }
                return allMessages
            }
        }
        return []
    }

    getHistory(): DetailedListItemGroup[] {
        if (this.initialized) {
            const tabCollection = this.db.getCollection<Tab>(TabCollection)
            const tabs = tabCollection.find()
            this.logger.debug(`Getting history from ${tabs.length} tabs`)
            return groupTabsByDate(tabs)
        }
        return []
    }

    deleteHistory(historyId: string) {
        if (this.initialized) {
            const tabCollection = this.db.getCollection<Tab>(TabCollection)
            this.logger.info(`Deleting history: historyId=${historyId}`)
            tabCollection.findAndRemove({ historyId })
            const tabId = this.getOpenTabId(historyId)
            if (tabId) {
                this.historyIdMapping.delete(tabId)
            }
        }
    }

    addMessage(tabId: string, tabType: TabType, conversationId: string, message: Message) {
        if (this.initialized) {
            const tabCollection = this.db.getCollection<Tab>(TabCollection)
            this.logger.info(`Adding message: tabId=${tabId}, tabType=${tabType}, conversationId=${conversationId}`)

            let historyId = this.historyIdMapping.get(tabId)

            if (!historyId) {
                historyId = crypto.randomUUID()
                this.logger.debug(`No historyId found, creating new one: ${historyId}`)
                this.setHistoryIdMapping(tabId, historyId)
            }

            const tabData = historyId ? tabCollection.findOne({ historyId }) : undefined
            const tabTitle =
                message.type === ('prompt' as ChatItemType) && message.body.trim().length > 0
                    ? message.body
                    : tabData?.title || 'Amazon Q Chat'
            message = this.formatChatHistoryMessage(message)
            message.characterCount = this.calculateMessageCharacterCount(message)
            if (tabData) {
                this.logger.info(`Found existing tab data, updating conversations`)
                tabData.conversations = updateOrCreateConversation(tabData.conversations, conversationId, message)
                tabData.updatedAt = new Date()
                tabData.title = tabTitle
                tabCollection.update(tabData)
            } else {
                this.logger.info(`No existing tab data, creating new tab entry`)
                tabCollection.insert({
                    historyId,
                    updatedAt: new Date(),
                    isOpen: true,
                    tabType: tabType,
                    title: tabTitle,
                    conversations: [{ conversationId, clientType: ClientType.VSCode, messages: [message] }],
                })
            }
            CWCTelemetryHelper.instance.record_TODO(tabId, conversationId, message)
        }
    }

    private formatChatHistoryMessage(message: Message): Message {
        if (message.type === ('prompt' as ChatItemType)) {
            return {
                ...message,
                userInputMessageContext: {
                    // Only keep toolResults in history
                    toolResults: message.userInputMessageContext?.toolResults,
                },
            }
        }
        return message
    }

    /**
     * Fixes the history to maintain the following invariants:
     * 1. The history contains at most MaxConversationHistoryMessages messages. Oldest messages are dropped.
     * 2. The history character length is <= MaxConversationHistoryCharacters. Oldest messages are dropped.
     * 3. The first message is from the user. Oldest messages are dropped if needed.
     * 4. The last message is from the assistant. The last message is dropped if it is from the user.
     * 5. If the last message is from the assistant and it contains tool uses, and a next user
     *    message is set without tool results, then the user message will have cancelled tool results.
     */
    fixHistory(tabId: string, newUserMessage: ChatMessage, conversationId: string): void {
        if (!this.initialized) {
            return
        }
        const historyId = this.historyIdMapping.get(tabId)
        this.logger.info(`Fixing history: tabId=${tabId}, historyId=${historyId || 'undefined'}`)

        if (!historyId) {
            return
        }

        const tabCollection = this.db.getCollection<Tab>(TabCollection)
        const tabData = tabCollection.findOne({ historyId })
        if (!tabData) {
            return
        }

        let allMessages = tabData.conversations.flatMap((conversation: Conversation) => conversation.messages)
        this.logger.info(`Found ${allMessages.length} messages in conversation`)

        //  Make sure we don't exceed MaxConversationHistoryMessages
        allMessages = this.trimHistoryToMaxLength(allMessages)

        //  Drop empty assistant partial if it’s the last message
        this.handleEmptyAssistantMessage(allMessages)

        //  Make sure max characters ≤ MaxConversationHistoryCharacters
        allMessages = this.trimMessagesToMaxLength(allMessages)

        //  Ensure messages in history a valid for server side checks
        this.ensureValidMessageSequence(allMessages)

        //  If the last message is from the assistant and it contains tool uses, and a next user message is set without tool results, then the user message will have cancelled tool results.
        this.handleToolUses(allMessages, newUserMessage)

        tabData.conversations = [
            {
                conversationId: conversationId,
                clientType: ClientType.VSCode,
                messages: allMessages,
            },
        ]
        tabData.updatedAt = new Date()
        tabCollection.update(tabData)
        this.logger.info(`Updated tab data in collection`)
    }

    private trimHistoryToMaxLength(messages: Message[]): Message[] {
        while (messages.length > MaxConversationHistoryMessages) {
            // Find the next valid user message to start from
            const indexToTrim = this.findIndexToTrim(messages)
            if (indexToTrim !== undefined && indexToTrim > 0) {
                this.logger.debug(`Removing the first ${indexToTrim} elements to maintain valid history length`)
                messages.splice(0, indexToTrim)
            } else {
                this.logger.debug('Could not find a valid point to trim, reset history to reduce history size')
                return []
            }
        }
        return messages
    }

    private handleEmptyAssistantMessage(messages: Message[]): void {
        if (messages.length === 0) {
            return
        }

        const lastMsg = messages[messages.length - 1]
        if (
            lastMsg.type === ('answer' as ChatItemType) &&
            (!lastMsg.body || lastMsg.body.trim().length === 0) &&
            (!lastMsg.toolUses || lastMsg.toolUses.length === 0)
        ) {
            this.logger.debug(
                'Last message is empty partial assistant. Removed last assistant message and user message'
            )
            messages.splice(-2)
        }
    }

    private trimMessagesToMaxLength(messages: Message[]): Message[] {
        let totalCharacters = this.calculateCharacterCount(messages)
        while (totalCharacters > MaxConversationHistoryCharacters && messages.length > 2) {
            // Find the next valid user message to start from
            const indexToTrim = this.findIndexToTrim(messages)
            if (indexToTrim !== undefined && indexToTrim > 0) {
                this.logger.debug(
                    `Removing the first ${indexToTrim} elements in the history due to character count limit`
                )
                messages.splice(0, indexToTrim)
            } else {
                this.logger.debug('Could not find a valid point to trim, reset history to reduce character count')
                return []
            }
            totalCharacters = this.calculateCharacterCount(messages)
        }
        return messages
    }

    private calculateCharacterCount(allMessages: Message[]): number {
        let count = 0
        for (const message of allMessages) {
            count += message.characterCount ?? 0
        }
        this.logger.debug(`Current history characters: ${count}`)
        return count
    }

    private calculateMessageCharacterCount(message: Message): number {
        let count = message.body.length

        // Count characters in tool uses
        if (message.toolUses) {
            try {
                for (const toolUse of message.toolUses) {
                    count += JSON.stringify(toolUse).length
                }
            } catch (e) {
                this.logger.error(`Error counting toolUses: ${String(e)}`)
            }
        }
        // Count characters in tool results
        if (message.userInputMessageContext?.toolResults) {
            try {
                for (const toolResul of message.userInputMessageContext.toolResults) {
                    count += JSON.stringify(toolResul).length
                }
            } catch (e) {
                this.logger.error(`Error counting toolResults: ${String(e)}`)
            }
        }
        return count
    }

    private findIndexToTrim(allMessages: Message[]): number | undefined {
        for (let i = 2; i < allMessages.length; i++) {
            const message = allMessages[i]
            if (message.type === ('prompt' as ChatItemType) && this.isValidUserMessageWithoutToolResults(message)) {
                return i
            }
        }
        return undefined
    }

    private isValidUserMessageWithoutToolResults(message: Message): boolean {
        const ctx = message.userInputMessageContext
        return !!ctx && (!ctx.toolResults || ctx.toolResults.length === 0) && message.body !== ''
    }

    private ensureValidMessageSequence(messages: Message[]): void {
        //  Make sure the first stored message is from the user (type === 'prompt'), else drop
        while (messages.length > 0 && messages[0].type === ('answer' as ChatItemType)) {
            messages.shift()
            this.logger.debug('Dropped first message since it is not from user')
        }

        //  Make sure the last stored message is from the assistant (type === 'answer'), else drop
        if (messages.length > 0 && messages[messages.length - 1].type === ('prompt' as ChatItemType)) {
            messages.pop()
            this.logger.debug('Dropped trailing user message')
        }
    }

    private handleToolUses(messages: Message[], newUserMessage: ChatMessage): void {
        if (messages.length === 0) {
            if (newUserMessage.userInputMessage?.userInputMessageContext?.toolResults) {
                this.logger.debug('No history message found, but new user message has tool results.')
                newUserMessage.userInputMessage.userInputMessageContext.toolResults = undefined
                // tool results are empty, so content must not be empty
                newUserMessage.userInputMessage.content = 'Conversation history was too large, so it was cleared.'
            }
            return
        }

        const lastMsg = messages[messages.length - 1]
        if (lastMsg.toolUses && lastMsg.toolUses.length > 0) {
            const toolResults = newUserMessage.userInputMessage?.userInputMessageContext?.toolResults
            if (!toolResults || toolResults.length === 0) {
                this.logger.debug(
                    `No tools results in last user message following a tool use message from assisstant, marking as canceled`
                )
                if (newUserMessage.userInputMessage?.userInputMessageContext) {
                    newUserMessage.userInputMessage.userInputMessageContext.toolResults = lastMsg.toolUses.map(
                        (toolUse) => ({
                            toolUseId: toolUse.toolUseId,
                            content: [
                                {
                                    type: 'Text',
                                    text: 'Tool use was cancelled by the user',
                                },
                            ],
                            status: ToolResultStatus.ERROR,
                        })
                    )
                }
            }
        }
    }
}
