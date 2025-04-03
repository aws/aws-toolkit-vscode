/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from '../../fs/fs'
import path from 'path'

import { TabType } from '../../../amazonq/webview/ui/storages/tabsStorage'
import { ChatItem, ChatItemButton, DetailedListItem, DetailedListItemGroup, MynahIconsType } from '@aws/mynah-ui'

export const TabCollection = 'tabs'

export const historyPath = path.join('.aws', 'amazonq', 'history')

export type Tab = {
    historyId: string
    isOpen: boolean
    updatedAt: Date
    tabType: TabType
    title: string
    conversations: Conversation[]
}

export type Conversation = {
    conversationId: string
    clientType: ClientType
    messages: ChatItem[]
}

export enum ClientType {
    VSCode = 'IDE-VSCode',
    JetBrains = 'IDE_JetBrains',
    CLI = 'CLI',
}

/**
 *
 * This adapter implements the LokiPersistenceAdapter interface for file system operations using web-compatible shared fs utils.
 * It provides methods for loading, saving, and deleting databases, as well as ensuring
 * the existence of the directory.
 *
 * Error Handling:
 * - All methods use try-catch blocks to to prevent breaking the application
 * - In case of errors, the callback functions are used to communicate the error state
 *   without throwing exceptions.
 *
 */
export class FileSystemAdapter implements LokiPersistenceAdapter {
    private directory
    constructor(directory: string) {
        this.directory = directory
    }

    async ensureDirectory() {
        try {
            await fs.exists(this.directory)
        } catch {
            await fs.mkdir(this.directory)
        }
    }

    async loadDatabase(dbname: string, callback: (data: string | undefined | Error) => void) {
        try {
            await this.ensureDirectory()
            const filename = path.join(this.directory, dbname)

            const exists = await fs.exists(filename)
            if (!exists) {
                callback(undefined)
                return
            }

            const data = await fs.readFileText(filename)
            callback(data)
        } catch (err: any) {
            callback(err)
        }
    }

    async saveDatabase(dbname: string, dbstring: string, callback: (err: Error | undefined) => void) {
        try {
            await this.ensureDirectory()
            const filename = path.join(this.directory, dbname)

            await fs.writeFile(filename, dbstring, 'utf8')
            callback(undefined)
        } catch (err: any) {
            callback(err)
        }
    }

    async deleteDatabase(dbname: string, callback: (err: Error | undefined) => void) {
        try {
            const filename = path.join(this.directory, dbname)

            const exists = await fs.exists(filename)
            if (exists) {
                await fs.delete(filename)
            }
            callback(undefined)
        } catch (err: any) {
            callback(err)
        }
    }
}

export function updateOrCreateConversation(
    conversations: Conversation[],
    conversationId: string,
    newMessage: ChatItem
): Conversation[] {
    const existingConversation = conversations.find((conv) => conv.conversationId === conversationId)

    if (existingConversation) {
        return conversations.map((conv) =>
            conv.conversationId === conversationId ? { ...conv, messages: [...conv.messages, newMessage] } : conv
        )
    } else {
        return [
            ...conversations,
            {
                conversationId,
                clientType: ClientType.VSCode,
                messages: [newMessage],
            },
        ]
    }
}

export function groupTabsByDate(tabs: Tab[]): DetailedListItemGroup[] {
    const now = new Date()
    const today = new Date(now.setHours(0, 0, 0, 0))
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const lastWeek = new Date(today)
    lastWeek.setDate(lastWeek.getDate() - 7)
    const lastMonth = new Date(today)
    lastMonth.setMonth(lastMonth.getMonth() - 1)

    // Sort tabs by updatedAt in descending order
    const sortedTabs = [...tabs]
        .map((tab) => ({ ...tab, updatedAt: new Date(tab.updatedAt) }))
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())

    // Helper function to convert Tab to DetailedListItem
    const tabToDetailedListItem = (tab: Tab): DetailedListItem => ({
        icon: getTabTypeIcon(tab.tabType),
        // Show open tabs as bold (in markdown)
        description: tab.isOpen ? `**${tab.title}**` : tab.title,
        actions: getConversationActions(tab.historyId),
        id: tab.historyId,
        // Add other properties needed for DetailedListItem
    })

    const tabGroups = [
        {
            name: 'Today',
            icon: 'calendar' as MynahIconsType,
            tabs: sortedTabs.filter((tab) => tab.updatedAt >= today),
        },
        {
            name: 'Yesterday',
            icon: 'calendar' as MynahIconsType,
            tabs: sortedTabs.filter((tab) => tab.updatedAt >= yesterday && tab.updatedAt < today),
        },
        {
            name: 'Last Week',
            icon: 'calendar' as MynahIconsType,
            tabs: sortedTabs.filter((tab) => tab.updatedAt >= lastWeek && tab.updatedAt < yesterday),
        },
        {
            name: 'Last Month',
            icon: 'calendar' as MynahIconsType,
            tabs: sortedTabs.filter((tab) => tab.updatedAt >= lastMonth && tab.updatedAt < lastWeek),
        },
        {
            name: 'Older',
            icon: 'calendar' as MynahIconsType,
            tabs: sortedTabs.filter((tab) => tab.updatedAt < lastMonth),
        },
    ]

    // Convert to DetailedListItemGroup[] and filter out empty groups
    return tabGroups
        .filter((group) => group.tabs.length > 0)
        .map((group) => ({
            groupName: group.name,
            icon: group.icon,
            children: group.tabs.map(tabToDetailedListItem),
        }))
}

const getConversationActions = (historyId: string): ChatItemButton[] => [
    /* Temporarily hide export chat button from tab bar
    {
        text: 'Export',
        icon: 'external' as MynahIconsType,
        id: historyId,
    }, */
    {
        text: 'Delete',
        icon: 'trash' as MynahIconsType,
        id: historyId,
    },
]

function getTabTypeIcon(tabType: TabType): MynahIconsType {
    switch (tabType) {
        case 'cwc':
            return 'chat'
        case 'doc':
            return 'file'
        case 'review':
            return 'bug'
        case 'gumby':
            return 'transform'
        case 'testgen':
            return 'check-list'
        case 'featuredev':
            return 'code-block'
        default:
            return 'chat'
    }
}
