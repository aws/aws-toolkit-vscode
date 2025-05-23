/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { InlineCompletionItemWithReferences } from '@aws/language-server-runtimes-types'

// TODO: add more needed data to the session interface
export interface CodeWhispererSession {
    sessionId: string
    suggestions: InlineCompletionItemWithReferences[]
    // TODO: might need to convert to enum states
    isRequestInProgress: boolean
    requestStartTime: number
    firstCompletionDisplayLatency?: number
}

export class SessionManager {
    private activeSession?: CodeWhispererSession
    private _acceptedSuggestionCount: number = 0

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

    public getActiveRecommendation(): InlineCompletionItemWithReferences[] {
        return this.activeSession?.suggestions ?? []
    }

    public get acceptedSuggestionCount(): number {
        return this._acceptedSuggestionCount
    }

    public incrementSuggestionCount() {
        this._acceptedSuggestionCount += 1
    }

    public clear() {
        this.activeSession = undefined
    }
}
