/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { distance } from 'fastest-levenshtein'
import { AcceptedSuggestion } from './model'
import globals from '../../../shared/extensionGlobals'
import { getLogger } from '../../../shared/logger/logger'
import { telemetry } from '../../../shared/telemetry/telemetry'

/**
 * This singleton class is mainly used for calculating the percentage of user modification.
 * The current calculation method is (Levenshtein edit distance / acceptedSuggestion.length).
 */
export class CWCCodeSuggestionTracker {
    private _eventQueue: AcceptedSuggestion[]
    private _timer?: NodeJS.Timer
    private static instance: CWCCodeSuggestionTracker

    /**
     * the interval of the background thread invocation, which is triggered by the timer
     */
    private static readonly defaultCheckPeriodMillis = 1000 * 60 * 1 // 1 minute in milliseconds
    /**
     * modification should be recorded at least 5 minutes after accepted into the editor
     */
    private static readonly defaultModificationIntervalMillis = 1000 * 60 * 5 // 5 minutes in milliseconds

    /**
     * This is to avoid user overflowing the eventQueue by spamming accepted suggestions
     */
    private static readonly defaultMaxQueueSize = 10000

    private constructor() {
        this._eventQueue = []
    }

    public enqueue(suggestion: AcceptedSuggestion) {
        if (!globals.telemetry.telemetryEnabled) {
            return
        }

        if (this._eventQueue.length >= 0) {
            this.startTimer()
        }

        if (this._eventQueue.length >= CWCCodeSuggestionTracker.defaultMaxQueueSize) {
            this._eventQueue.shift()
        }
        this._eventQueue.push(suggestion)
    }

    public async flush() {
        if (!globals.telemetry.telemetryEnabled) {
            this._eventQueue = []
            this.closeTimer()
            return
        }

        const currentTime = new Date()
        const newEventQueue: AcceptedSuggestion[] = []
        for (const suggestion of this._eventQueue) {
            if (
                currentTime.getTime() - suggestion.time.getTime() >
                CWCCodeSuggestionTracker.defaultModificationIntervalMillis
            ) {
                this.emitTelemetryOnSuggestion(suggestion)
            } else {
                newEventQueue.push(suggestion)
            }
        }

        this._eventQueue = newEventQueue
        if (this._eventQueue.length === 0) {
            this.closeTimer()
        }
    }

    public async emitTelemetryOnSuggestion(suggestion: AcceptedSuggestion) {
        let percentage = 1.0
        try {
            if (suggestion.fileUrl?.scheme !== '') {
                const document = await vscode.workspace.openTextDocument(suggestion.fileUrl)
                if (document) {
                    const currString = document.getText(
                        new vscode.Range(suggestion.startPosition, suggestion.endPosition)
                    )
                    percentage = this.checkDiff(currString, suggestion.originalString)
                }
            }
        } catch (e) {
            getLogger().verbose(`Exception Thrown from CodeSuggestionTracker: ${e}`)
        } finally {
            telemetry.codewhispererchat_modifyCode.emit({
                cwsprChatConversationId: suggestion.conversationID,
                cwsprChatMessageId: suggestion.messageID,
                cwsprChatModificationPercentage: percentage ? percentage : 0,
            })
        }
    }

    /**
     * This function calculates the Levenshtein edit distance of currString from original accepted String
     * then return a percentage against the length of accepted string (capped by 1,0)
     * @param currString the current string in the same location as the previously accepted suggestion
     * @param acceptedString the accepted suggestion that was inserted into the editor
     */
    public checkDiff(currString?: string, acceptedString?: string): number {
        if (!currString || !acceptedString || currString.length == 0 || acceptedString.length == 0) {
            return 1.0
        }

        const diff = distance(currString, acceptedString)
        return Math.min(1.0, diff / acceptedString.length)
    }

    public async startTimer() {
        if (!this._timer) {
            this._timer = setTimeout(async () => {
                try {
                    await this.flush()
                } finally {
                    if (this._timer !== undefined) {
                        this._timer!.refresh()
                    }
                }
            }, CWCCodeSuggestionTracker.defaultCheckPeriodMillis)
        }
    }

    public closeTimer() {
        if (this._timer !== undefined) {
            clearTimeout(this._timer)
            this._timer = undefined
        }
    }

    public async shutdown() {
        this.closeTimer()

        if (globals.telemetry.telemetryEnabled) {
            try {
                this.flush()
            } finally {
                this._eventQueue = []
            }
        }
    }

    public static getTracker(): CWCCodeSuggestionTracker {
        if (!CWCCodeSuggestionTracker.instance) {
            CWCCodeSuggestionTracker.instance = new CWCCodeSuggestionTracker()
        }
        return CWCCodeSuggestionTracker.instance
    }
}
