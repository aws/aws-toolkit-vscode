/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { InlineCompletionItemWithReferences } from '@aws/language-server-runtimes-types'
import {
    FileDiagnostic,
    getDiagnosticsOfCurrentFile,
    ImportAdderProvider,
    ReferenceInlineProvider,
} from 'aws-core-vscode/codewhisperer'

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
    private _currentSuggestionIndex = 0
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
        this._currentSuggestionIndex = 0
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

    public updateActiveEditsStreakToken(partialResultToken: number | string) {
        if (!this.activeSession) {
            return
        }
        this.activeSession.editsStreakPartialResultToken = partialResultToken
    }

    public clear() {
        this.activeSession = undefined
        this._currentSuggestionIndex = 0
        this.clearReferenceInlineHintsAndImportHints()
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

    public onNextSuggestion() {
        if (this.activeSession?.suggestions && this.activeSession?.suggestions.length > 0) {
            this._currentSuggestionIndex = (this._currentSuggestionIndex + 1) % this.activeSession.suggestions.length
            this.updateCodeReferenceAndImports()
        }
    }

    public onPrevSuggestion() {
        if (this.activeSession?.suggestions && this.activeSession.suggestions.length > 0) {
            this._currentSuggestionIndex =
                (this._currentSuggestionIndex - 1 + this.activeSession.suggestions.length) %
                this.activeSession.suggestions.length
            this.updateCodeReferenceAndImports()
        }
    }

    private clearReferenceInlineHintsAndImportHints() {
        ReferenceInlineProvider.instance.removeInlineReference()
        ImportAdderProvider.instance.clear()
    }

    // Ideally use this API handleDidShowCompletionItem
    // https://github.com/microsoft/vscode/blob/main/src/vscode-dts/vscode.proposed.inlineCompletionsAdditions.d.ts#L83
    updateCodeReferenceAndImports() {
        if (this.activeSession?.suggestions && this.activeSession.suggestions.length > 0) {
            const reference = this.activeSession.suggestions[this._currentSuggestionIndex].references
            if (reference && reference.length > 0) {
                ReferenceInlineProvider.instance.setInlineReference(
                    this.activeSession.startPosition.line,
                    this.activeSession.suggestions[this._currentSuggestionIndex].insertText.toString(),
                    reference
                )
            }
            if (vscode.window.activeTextEditor) {
                ImportAdderProvider.instance.onShowRecommendation(
                    vscode.window.activeTextEditor.document,
                    this.activeSession.startPosition.line,
                    this.activeSession.suggestions[this._currentSuggestionIndex]
                )
            }
        }
    }
}
