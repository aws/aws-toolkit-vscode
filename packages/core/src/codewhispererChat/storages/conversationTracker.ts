/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'

/**
 * A tracker for conversations to manage cancellation and prevent message leakage
 * Tracks the last 4-5 conversations across tabs for cancellation checks
 */
export class ConversationTracker {
    // Map of trigger ID to cancellation token
    private triggerToToken = new Map<string, vscode.CancellationTokenSource>()

    // Map of tabId to array of triggerIds (most recent first)
    private tabToTriggers = new Map<string, string[]>()

    // Maximum number of triggers to keep per tab
    private readonly maxTriggersPerTab = 5

    // Singleton instance
    private static instance: ConversationTracker

    /**
     * Get the singleton instance
     */
    public static getInstance(): ConversationTracker {
        if (!ConversationTracker.instance) {
            ConversationTracker.instance = new ConversationTracker()
        }
        return ConversationTracker.instance
    }

    /**
     * Register a trigger ID with a cancellation token
     * This associates the token with the triggerId for the entire duration of the agentic loop
     */
    public registerTrigger(triggerID: string, tokenSource: vscode.CancellationTokenSource, tabID?: string): void {
        if (!triggerID || !tokenSource) {
            return
        }

        this.triggerToToken.set(triggerID, tokenSource)

        // If tabID is provided, associate this trigger with the tab
        if (tabID) {
            const triggers = this.tabToTriggers.get(tabID) || []
            // Add to the beginning (most recent first)
            triggers.unshift(triggerID)
            this.tabToTriggers.set(tabID, triggers)

            // Clean up old triggers for this tab if needed
            this.cleanupTabTriggers(tabID)
        }
    }

    /**
     * Mark a trigger as completed (agentic loop ended)
     * This removes the token association but keeps the conversation history
     */
    public markTriggerCompleted(triggerID: string): void {
        if (!triggerID) {
            return
        }
        this.triggerToToken.get(triggerID)?.dispose()
        this.triggerToToken.delete(triggerID)
    }

    /**
     * Cancel a conversation by trigger ID
     */
    public cancelTrigger(triggerID: string): boolean {
        if (!triggerID) {
            return false
        }

        const tokenSource = this.triggerToToken.get(triggerID)
        if (tokenSource) {
            tokenSource.cancel()
            return true
        }
        return false
    }

    /**
     * Cancel all triggers for a tab
     */
    public cancelTabTriggers(tabID: string): number {
        if (!tabID) {
            return 0
        }

        const triggers = this.tabToTriggers.get(tabID) || []
        let cancelCount = 0

        for (const triggerId of triggers) {
            if (this.cancelTrigger(triggerId)) {
                cancelCount++
            }
        }

        return cancelCount
    }

    /**
     * Check if a trigger has been cancelled
     */
    public isTriggerCancelled(triggerID: string): boolean {
        if (!triggerID) {
            return true
        }

        const tokenSource = this.triggerToToken.get(triggerID)
        return tokenSource ? tokenSource.token.isCancellationRequested : false
    }

    /**
     * Get the cancellation token for a trigger
     */
    public getTokenForTrigger(triggerID: string): vscode.CancellationToken | undefined {
        const tokenSource = this.triggerToToken.get(triggerID)
        return tokenSource?.token
    }

    /**
     * Clean up old triggers for a specific tab
     * Keeps only the MAX_TRIGGERS_PER_TAB most recent triggers
     */
    private cleanupTabTriggers(tabID: string): void {
        const triggers = this.tabToTriggers.get(tabID)
        if (!triggers || triggers.length <= this.maxTriggersPerTab) {
            return
        }
        triggers.splice(this.maxTriggersPerTab)
    }

    /**
     * Clean up all triggers for a tab without canceling them
     * This is useful when a tab is closed or when we want to release resources
     * without triggering cancellation events
     */
    public clearTabTriggers(tabID: string): number {
        if (!tabID) {
            return 0
        }
        const triggers = this.tabToTriggers.get(tabID) || []
        let cleanupCount = 0

        // Remove all triggers from the token map without canceling them
        for (const triggerId of triggers) {
            if (this.triggerToToken.delete(triggerId)) {
                cleanupCount++
            }
        }

        // Clear the tab's trigger list
        this.tabToTriggers.delete(tabID)

        return cleanupCount
    }
}
