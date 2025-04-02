/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import Loki from 'lokijs'
import * as vscode from 'vscode'
import { TabType } from '../../../amazonq/webview/ui/storages/tabsStorage'
import { ChatItem, ChatItemType, DetailedListItemGroup } from '@aws/mynah-ui'
import {
    ClientType,
    Conversation,
    FileSystemAdapter,
    groupTabsByDate,
    Tab,
    TabCollection,
    updateOrCreateConversation,
} from './util'
import crypto from 'crypto'
import path from 'path'
import { fs } from '../../fs/fs'

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
        return 'no-workspace'
    }

    async databaseInitialize() {
        let entries = this.db.getCollection(TabCollection)
        if (entries === null) {
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
            if (historyId) {
                tabCollection.findAndRemove({ historyId })
            }
            this.historyIdMapping.delete(tabId)
        }
    }

    updateTabOpenState(tabId: string, isOpen: boolean) {
        if (this.initialized) {
            const tabCollection = this.db.getCollection<Tab>(TabCollection)
            const historyId = this.historyIdMapping.get(tabId)
            if (historyId) {
                tabCollection.findAndUpdate({ historyId }, (tab: Tab) => {
                    tab.isOpen = isOpen
                    return tab
                })
                if (!isOpen) {
                    this.historyIdMapping.delete(tabId)
                }
            }
        }
    }

    searchMessages(filter: string): DetailedListItemGroup[] {
        let searchResults: DetailedListItemGroup[] = []
        if (this.initialized) {
            if (!filter) {
                return this.getHistory()
            }

            const searchTermLower = filter.toLowerCase()
            const tabCollection = this.db.getCollection<Tab>(TabCollection)
            const tabs = tabCollection.find()
            const filteredTabs = tabs.filter((tab: Tab) => {
                return tab.conversations.some((conversation: Conversation) => {
                    return conversation.messages.some((message: ChatItem) => {
                        return message.body?.toLowerCase().includes(searchTermLower)
                    })
                })
            })
            searchResults = groupTabsByDate(filteredTabs)
        }
        if (searchResults.length === 0) {
            searchResults = [{ children: [{ description: 'No matches found' }] }]
        }
        return searchResults
    }

    /**
     * Get messages for specified tabId
     * @param tabId The ID of the tab to get messages from
     * @param numMessages Optional number of most recent messages to return. If not provided, returns all messages.
     */
    getMessages(tabId: string, numMessages?: number) {
        if (this.initialized) {
            const tabCollection = this.db.getCollection<Tab>(TabCollection)
            const historyId = this.historyIdMapping.get(tabId)
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
            return groupTabsByDate(tabs)
        }
        return []
    }

    deleteHistory(historyId: string) {
        if (this.initialized) {
            const tabCollection = this.db.getCollection<Tab>(TabCollection)
            tabCollection.findAndRemove({ historyId })
            const tabId = this.getOpenTabId(historyId)
            if (tabId) {
                this.historyIdMapping.delete(tabId)
            }
        }
    }

    addMessage(tabId: string, tabType: TabType, conversationId: string, chatItem: ChatItem) {
        if (this.initialized) {
            const tabCollection = this.db.getCollection<Tab>(TabCollection)

            let historyId = this.historyIdMapping.get(tabId)

            if (!historyId) {
                historyId = crypto.randomUUID()
                this.setHistoryIdMapping(tabId, historyId)
            }

            const tabData = historyId ? tabCollection.findOne({ historyId }) : undefined
            const tabTitle =
                (chatItem.type === ('prompt' as ChatItemType) ? chatItem.body : tabData?.title) || 'Amazon Q Chat'
            if (tabData) {
                tabData.conversations = updateOrCreateConversation(tabData.conversations, conversationId, chatItem)
                tabData.updatedAt = new Date()
                tabData.title = tabTitle
                tabCollection.update(tabData)
            } else {
                tabCollection.insert({
                    historyId,
                    updatedAt: new Date(),
                    isOpen: true,
                    tabType: tabType,
                    title: tabTitle,
                    conversations: [{ conversationId, clientType: ClientType.VSCode, messages: [chatItem] }],
                })
            }
        }
    }
}
