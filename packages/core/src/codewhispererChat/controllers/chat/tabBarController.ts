/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from '../../../shared/fs/fs'
import {
    DetailedListActionClickMessage,
    DetailedListFilterChangeMessage,
    DetailedListItemSelectMessage,
} from '../../view/connector/connector'
import * as vscode from 'vscode'
import { Messenger } from './messenger/messenger'
import { Database } from '../../../shared/db/chatDb/chatDb'
import { TabBarButtonClick, SaveChatMessage } from './model'
import { Conversation, Tab } from '../../../shared/db/chatDb/util'
import { DetailedListItemGroup, MynahIconsType } from '@aws/mynah-ui'

export class TabBarController {
    private readonly messenger: Messenger
    private chatHistoryDb = Database.getInstance()
    private loadedChats: boolean = false
    private searchTimeout: NodeJS.Timeout | undefined = undefined
    private readonly DebounceTime = 300 // milliseconds

    constructor(messenger: Messenger) {
        this.messenger = messenger
    }
    async processActionClickMessage(msg: DetailedListActionClickMessage) {
        if (msg.listType === 'history') {
            if (msg.action.text === 'Delete') {
                this.chatHistoryDb.deleteHistory(msg.action.id)
                this.messenger.sendUpdateDetailedListMessage('history', { list: this.generateHistoryList() })
            } else if (msg.action.text === 'Export') {
                // If conversation is already open, export it
                const openTabId = this.chatHistoryDb.getOpenTabId(msg.action.id)
                if (openTabId) {
                    await this.exportChatButtonClicked({ tabID: openTabId, buttonId: 'export_chat' })
                } // If conversation is not open, restore it before exporting
                else {
                    const selectedTab = this.chatHistoryDb.getTab(msg.action.id)
                    this.restoreTab(selectedTab, true)
                }
            }
        }
    }

    async processFilterChangeMessage(msg: DetailedListFilterChangeMessage) {
        if (msg.listType === 'history') {
            const searchFilter = msg.filterValues['search']
            if (typeof searchFilter !== 'string') {
                return
            }

            // Clear any pending search
            if (this.searchTimeout) {
                clearTimeout(this.searchTimeout)
            }

            // Set new timeout for this search
            this.searchTimeout = setTimeout(() => {
                const searchResults = this.chatHistoryDb.searchMessages(searchFilter)
                this.messenger.sendUpdateDetailedListMessage('history', { list: searchResults })
            }, this.DebounceTime)
        }
    }

    // If selected is conversation is already open, select that tab. Else, open new tab with conversation.
    processItemSelectMessage(msg: DetailedListItemSelectMessage) {
        if (msg.listType === 'history') {
            const historyID = msg.item.id
            if (historyID) {
                const openTabID = this.chatHistoryDb.getOpenTabId(historyID)
                if (!openTabID) {
                    const selectedTab = this.chatHistoryDb.getTab(historyID)
                    this.restoreTab(selectedTab)
                } else {
                    this.messenger.sendSelectTabMessage(openTabID, historyID)
                }
                this.messenger.sendCloseDetailedListMessage('history')
            }
        }
    }

    restoreTab(selectedTab?: Tab | null, exportTab?: boolean) {
        if (selectedTab) {
            this.messenger.sendRestoreTabMessage(
                selectedTab.historyId,
                selectedTab.tabType,
                selectedTab.conversations.flatMap((conv: Conversation) => conv.messages),
                exportTab
            )
        }
    }

    loadChats() {
        if (this.loadedChats) {
            return
        }
        this.loadedChats = true
        const openConversations = this.chatHistoryDb.getOpenTabs()
        if (openConversations) {
            for (const conversation of openConversations) {
                if (conversation.conversations && conversation.conversations.length > 0) {
                    this.restoreTab(conversation)
                }
            }
        }
    }

    async historyButtonClicked(message: TabBarButtonClick) {
        this.messenger.sendOpenDetailedListMessage(message.tabID, 'history', {
            header: { title: 'Chat history' },
            filterOptions: [
                {
                    type: 'textinput',
                    icon: 'search' as MynahIconsType,
                    id: 'search',
                    placeholder: 'Search...',
                    autoFocus: true,
                },
            ],
            list: this.generateHistoryList(),
        })
    }

    generateHistoryList(): DetailedListItemGroup[] {
        const historyItems = this.chatHistoryDb.getHistory()
        return historyItems.length > 0 ? historyItems : [{ children: [{ description: 'No chat history found' }] }]
    }

    async processSaveChat(message: SaveChatMessage) {
        try {
            await fs.writeFile(message.uri, message.serializedChat)
        } catch (error) {
            void vscode.window.showErrorMessage('An error occurred while exporting your chat.')
        }
    }

    async processTabBarButtonClick(message: TabBarButtonClick) {
        switch (message.buttonId) {
            case 'history_sheet':
                await this.historyButtonClicked(message)
                break
            case 'export_chat':
                await this.exportChatButtonClicked(message)
                break
        }
    }

    private async exportChatButtonClicked(message: TabBarButtonClick) {
        const defaultFileName = `q-dev-chat-${new Date().toISOString().split('T')[0]}.md`
        const workspaceFolders = vscode.workspace.workspaceFolders
        let defaultUri

        if (workspaceFolders && workspaceFolders.length > 0) {
            // Use the first workspace folder as root
            defaultUri = vscode.Uri.joinPath(workspaceFolders[0].uri, defaultFileName)
        } else {
            // Fallback if no workspace is open
            defaultUri = vscode.Uri.file(defaultFileName)
        }

        const saveUri = await vscode.window.showSaveDialog({
            filters: {
                Markdown: ['md'],
                HTML: ['html'],
            },
            defaultUri,
            title: 'Export chat',
        })

        if (saveUri) {
            // Determine format from file extension
            const format = saveUri.fsPath.endsWith('.md') ? 'markdown' : 'html'
            this.messenger.sendSerializeTabMessage(message.tabID, saveUri.fsPath, format)
        }
    }
}
