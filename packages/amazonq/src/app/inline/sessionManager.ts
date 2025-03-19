/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { InlineCompletionItemWithReferences } from '@aws/language-server-runtimes-types/inlineCompletionWithReferences'
import { InlineCompletionItem } from 'vscode'

// TODO: add more needed data to the session interface
interface CodeWhispererSession {
    sessionId: string
    suggestions: InlineCompletionItemWithReferences[]
    // TODO: might need to convert to enum states
    isRequestInProgress: boolean
    firstCompletionDisplayLatency?: number
}

export class SessionManager {
    static #instance: SessionManager
    private activeSession?: CodeWhispererSession
    private activeIndex: number = 0

    public static get instance() {
        return (this.#instance ??= new this())
    }

    public startSession(
        sessionId: string,
        suggestions: InlineCompletionItemWithReferences[],
        firstCompletionDisplayLatency?: number
    ) {
        this.activeSession = {
            sessionId,
            suggestions,
            isRequestInProgress: true,
            firstCompletionDisplayLatency,
        }
        this.activeIndex = 0
    }

    public closeSession() {
        if (!this.activeSession) {
            return
        }
        this.activeSession.isRequestInProgress = false
    }

    public updateSessionSuggestions(suggestions: InlineCompletionItemWithReferences[]) {
        if (!this.activeSession) {
            return
        }
        this.activeSession.suggestions = [...this.activeSession.suggestions, ...suggestions]
    }

    public incrementActiveIndex() {
        const suggestionCount = this.activeSession?.suggestions?.length
        if (!suggestionCount) {
            return
        }
        this.activeIndex === suggestionCount - 1 ? suggestionCount - 1 : this.activeIndex++
    }

    public decrementActiveIndex() {
        this.activeIndex === 0 ? 0 : this.activeIndex--
    }

    /*
        We have to maintain the active suggestion index ourselves because VS Code doesn't expose which suggestion it's currently showing
        In order to keep track of the right suggestion state, and for features such as reference tracker, this hack is still needed
     */

    public getActiveRecommendation(): InlineCompletionItem[] {
        let suggestionCount = this.activeSession?.suggestions.length
        if (!suggestionCount) {
            return []
        }
        if (suggestionCount === 1 && this.activeSession?.isRequestInProgress) {
            suggestionCount += 1
        }

        const activeSuggestion = this.activeSession?.suggestions[this.activeIndex] as InlineCompletionItem
        if (!activeSuggestion) {
            return []
        }
        const items = [activeSuggestion]
        // to make the total number of suggestions match the actual number
        for (let i = 1; i < suggestionCount; i++) {
            items.push({
                ...activeSuggestion,
                insertText: `${i}`,
            })
        }
        return items
    }

    public clear() {
        this.activeSession = undefined
        this.activeIndex = 0
    }
}
