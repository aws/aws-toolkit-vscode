/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { InlineCompletionItemWithReferences } from '@aws/language-server-runtimes-types'
import { FileDiagnostic, getDiagnosticsOfCurrentFile } from 'aws-core-vscode/codewhisperer'

// TODO: add more needed data to the session interface
export interface CodeWhispererSession {
    sessionId: string
    suggestions: InlineCompletionItemWithReferences[]
    // TODO: might need to convert to enum states
    isRequestInProgress: boolean
    requestStartTime: number
    firstCompletionDisplayLatency?: number
    startPosition: vscode.Position
    diagnosticsBeforeAccept: FileDiagnostic | undefined
    // partialResultToken for the next trigger if user accepts an EDITS suggestion
    editsStreakPartialResultToken?: number | string
    triggerOnAcceptance?: boolean
}

export class SessionManager {
    private activeSession?: CodeWhispererSession
    private _acceptedSuggestionCount: number = 0
    private _refreshedSessions = new Set<string>()

    constructor() {}

    public startSession(
        sessionId: string,
        suggestions: InlineCompletionItemWithReferences[],
        requestStartTime: number,
        startPosition: vscode.Position,
        firstCompletionDisplayLatency?: number
    ) {
        const diagnosticsBeforeAccept = getDiagnosticsOfCurrentFile()
        this.activeSession = {
            sessionId,
            suggestions,
            isRequestInProgress: true,
            requestStartTime,
            startPosition,
            firstCompletionDisplayLatency,
            diagnosticsBeforeAccept,
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

    public updateActiveEditsStreakToken(partialResultToken?: number | string) {
        if (!this.activeSession || !partialResultToken) {
            return
        }
        this.activeSession.editsStreakPartialResultToken = partialResultToken
    }

    public clear() {
        this.activeSession = undefined
    }

    // re-render the session ghost text to display paginated responses once per completed session
    public async maybeRefreshSessionUx() {
        if (
            this.activeSession &&
            !this.activeSession.isRequestInProgress &&
            !this._refreshedSessions.has(this.activeSession.sessionId)
        ) {
            await vscode.commands.executeCommand('editor.action.inlineSuggest.hide')
            await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger')
            if (this._refreshedSessions.size > 1000) {
                this._refreshedSessions.clear()
            }
            this._refreshedSessions.add(this.activeSession.sessionId)
        }
    }
}
