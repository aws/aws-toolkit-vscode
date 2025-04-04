/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Tool } from '@amzn/codewhisperer-streaming'
import { ChatHistoryManager } from './chatHistory'

/**
 * ChatHistoryStorage manages ChatHistoryManager instances for multiple tabs.
 * Each tab has its own ChatHistoryManager to maintain separate chat histories.
 */
export class ChatHistoryStorage {
    private histories: Map<string, ChatHistoryManager> = new Map()

    /**
     * Gets the ChatHistoryManager for a specific tab.
     * If no history exists for the tab, creates a new one.
     *
     * @param tabId The ID of the tab
     * @returns The ChatHistoryManager for the specified tab
     */
    public getTabHistory(tabId: string): ChatHistoryManager {
        const historyFromStorage = this.histories.get(tabId)
        if (historyFromStorage !== undefined) {
            return historyFromStorage
        }

        // Create a new ChatHistoryManager with the tabId
        const newHistory = new ChatHistoryManager(tabId)
        this.histories.set(tabId, newHistory)

        return newHistory
    }

    /**
     * Deletes the ChatHistoryManager for a specific tab.
     *
     * @param tabId The ID of the tab
     */
    public deleteHistory(tabId: string) {
        this.histories.delete(tabId)
    }

    public setTools(tabId: string, tools: Tool[]) {
        this.histories.get(tabId)?.setTools(tools)
    }
}
