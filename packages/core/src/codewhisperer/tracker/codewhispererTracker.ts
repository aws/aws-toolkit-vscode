/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import globals from '../../shared/extensionGlobals'
import { distance } from 'fastest-levenshtein'
import { AcceptedSuggestionEntry } from '../models/model'
import { getLogger } from '../../shared/logger/logger'
import { AmazonqModifyCode, telemetry } from '../../shared/telemetry/telemetry'
import { CodeWhispererUserGroupSettings } from '../util/userGroupUtil'
import { AuthUtil } from '../util/authUtil'
import { InsertedCode } from '../../codewhispererChat/controllers/chat/model'
import { codeWhispererClient } from '../client/codewhisperer'
import { logSendTelemetryEventFailure } from '../../codewhispererChat/controllers/chat/telemetryHelper'

/**
 * This singleton class is mainly used for calculating the percentage of user modification.
 * The current calculation method is (Levenshtein edit distance / acceptedSuggestion.length).
 */
export class CodeWhispererTracker {
    private _eventQueue: (AcceptedSuggestionEntry | InsertedCode)[]
    private _timer?: NodeJS.Timer
    private static instance: CodeWhispererTracker

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

    public enqueue(suggestion: AcceptedSuggestionEntry | InsertedCode) {
        if (!globals.telemetry.telemetryEnabled) {
            return
        }

        if (this._eventQueue.length >= 0) {
            this.startTimer().catch(e => {
                getLogger().error('startTimer failed: %s', (e as Error).message)
            })
        }

        if (this._eventQueue.length >= CodeWhispererTracker.defaultMaxQueueSize) {
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
        const newEventQueue: (AcceptedSuggestionEntry | InsertedCode)[] = []
        for (const suggestion of this._eventQueue) {
            if (
                currentTime.getTime() - suggestion.time.getTime() >
                CodeWhispererTracker.defaultModificationIntervalMillis
            ) {
                await this.emitTelemetryOnSuggestion(suggestion)
            } else {
                newEventQueue.push(suggestion)
            }
        }

        this._eventQueue = newEventQueue
        if (this._eventQueue.length === 0) {
            this.closeTimer()
        }
    }

    public async emitTelemetryOnSuggestion(suggestion: AcceptedSuggestionEntry | InsertedCode) {
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
            getLogger().verbose(`Exception Thrown from CodeWhispererTracker: ${e}`)
        } finally {
            if ('conversationID' in suggestion) {
                const event: AmazonqModifyCode = {
                    cwsprChatConversationId: suggestion.conversationID,
                    cwsprChatMessageId: suggestion.messageID,
                    cwsprChatModificationPercentage: percentage ? percentage : 0,
                    credentialStartUrl: AuthUtil.instance.startUrl,
                }

                telemetry.amazonq_modifyCode.emit(event)

                codeWhispererClient
                    .sendTelemetryEvent({
                        telemetryEvent: {
                            chatUserModificationEvent: {
                                conversationId: event.cwsprChatConversationId,
                                messageId: event.cwsprChatMessageId,
                                modificationPercentage: event.cwsprChatModificationPercentage,
                            },
                        },
                    })
                    .then()
                    .catch(logSendTelemetryEventFailure)
            } else {
                telemetry.codewhisperer_userModification.emit({
                    codewhispererRequestId: suggestion.requestId ? suggestion.requestId : 'undefined',
                    codewhispererSessionId: suggestion.sessionId ? suggestion.sessionId : undefined,
                    codewhispererTriggerType: suggestion.triggerType,
                    codewhispererSuggestionIndex: suggestion.index ? suggestion.index : 0,
                    codewhispererModificationPercentage: percentage ? percentage : 0,
                    codewhispererCompletionType: suggestion.completionType,
                    codewhispererLanguage: suggestion.language,
                    credentialStartUrl: AuthUtil.instance.startUrl,
                    codewhispererUserGroup: CodeWhispererUserGroupSettings.getUserGroup().toString(),
                })
                // TODO:
                // Temperary comment out user modification event, need further discussion on how to calculate this metric
                // TelemetryHelper.instance.sendUserModificationEvent(suggestion, percentage)
            }
        }
    }

    /**
     * This function calculates the Levenshtein edit distance of currString from original accepted String
     * then return a percentage against the length of accepted string (capped by 1,0)
     * @param currString the current string in the same location as the previously accepted suggestion
     * @param acceptedString the accepted suggestion that was inserted into the editor
     */
    public checkDiff(currString?: string, acceptedString?: string): number {
        if (!currString || !acceptedString || currString.length === 0 || acceptedString.length === 0) {
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
            }, CodeWhispererTracker.defaultCheckPeriodMillis)
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
                await this.flush()
            } finally {
                this._eventQueue = []
            }
        }
    }

    public static getTracker(): CodeWhispererTracker {
        if (!CodeWhispererTracker.instance) {
            CodeWhispererTracker.instance = new CodeWhispererTracker()
        }
        return CodeWhispererTracker.instance
    }
}
