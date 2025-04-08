/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { InlineCompletionItemWithReferences } from '@aws/language-server-runtimes-types'

// TODO: add more needed data to the session interface
interface CodeWhispererSession {
    sessionId: string
    suggestions: InlineCompletionItemWithReferences[]
    // TODO: might need to convert to enum states
    isRequestInProgress: boolean
    requestStartTime: number
    firstCompletionDisplayLatency?: number
}

export class SessionManager {
    private activeSession?: CodeWhispererSession
    private activeIndex: number = 0
    constructor() {}

    public startSession(
        sessionId: string,
        suggestions: InlineCompletionItemWithReferences[],
        requestStartTime: number,
        firstCompletionDisplayLatency?: number
    ) {
        this.activeSession = {
            sessionId,
            suggestions,
            isRequestInProgress: true,
            requestStartTime,
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

    public getActiveSession() {
        return this.activeSession
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

    public getActiveRecommendation(): InlineCompletionItemWithReferences[] {
        let suggestionCount = this.activeSession?.suggestions.length
        if (!suggestionCount) {
            return []
        }
        if (suggestionCount === 1 && this.activeSession?.isRequestInProgress) {
            suggestionCount += 1
        }

        const activeSuggestion = this.activeSession?.suggestions[this.activeIndex]
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
