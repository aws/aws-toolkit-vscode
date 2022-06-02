/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import globals from '../../../shared/extensionGlobals'
import * as telemetry from '../../../shared/telemetry/telemetry'
import { distance } from 'fastest-levenshtein'
import { AcceptedSuggestionEntry } from '../models/model'
import { getLogger } from '../../../shared/logger/logger'

/**
 * This singleton class is mainly used for calculating the percentage of user modification.
 * The current calculation method is (Levenshtein edit distance / acceptedSuggestion.length).
 */
export class ConsolasTracker {
    private _eventQueue: AcceptedSuggestionEntry[]
    private _timer?: NodeJS.Timer
    private static instance: ConsolasTracker

    /**
     * the interval of the background thread invocation, which is triggered by the timer
     */
    private static readonly DEFAULT_CHECK_PERIOD_MILLIS = 1000 * 60 * 1 // 1 minute in milliseconds
    /**
     * modification should be recorded at least 5 minutes after accepted into the editor
     */
    private static readonly DEFAULT_MODIFICATION_INTERVAL_MILLIS = 1000 * 60 * 5 // 5 minutes in milliseconds

    /**
     * This is to avoid user overflowing the eventQueue by spamming accepted suggestions
     */
    private static readonly DEFAULT_MAX_QUEUE_SIZE = 10000

    private constructor() {
        this._eventQueue = []
    }

    public enqueue(suggestion: AcceptedSuggestionEntry) {
        if (!globals.telemetry.telemetryEnabled) return

        if (this._eventQueue.length >= 0) {
            this.startTimer()
        }

        if (this._eventQueue.length >= ConsolasTracker.DEFAULT_MAX_QUEUE_SIZE) {
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
        const newEventQueue: AcceptedSuggestionEntry[] = []
        for (const suggestion of this._eventQueue) {
            if (
                currentTime.getTime() - suggestion.time.getTime() >
                ConsolasTracker.DEFAULT_MODIFICATION_INTERVAL_MILLIS
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

    public async emitTelemetryOnSuggestion(suggestion: AcceptedSuggestionEntry) {
        let percentage = 1.0
        try {
            getLogger().verbose(`Getting the file for content: ${suggestion.fileUrl}`)
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
            getLogger().verbose(`Exception Thrown from ConsolasTracker: ${e}`)
        } finally {
            telemetry.recordConsolasUserModification({
                consolasRequestId: suggestion.requestId ? suggestion.requestId : undefined,
                consolasSessionId: suggestion.sessionId ? suggestion.sessionId : undefined,
                consolasTriggerType: suggestion.triggerType,
                consolasSuggestionIndex: suggestion.index,
                consolasModificationPercentage: percentage,
                consolasCompletionType: suggestion.completionType,
                consolasLanguage: suggestion.language,
                consolasRuntime: suggestion.languageRuntime,
                consolasRuntimeSource: suggestion.languageRuntimeSource,
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
            }, ConsolasTracker.DEFAULT_CHECK_PERIOD_MILLIS)
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

    public static getTracker(): ConsolasTracker {
        if (!ConsolasTracker.instance) {
            ConsolasTracker.instance = new ConsolasTracker()
        }
        return ConsolasTracker.instance
    }
}
