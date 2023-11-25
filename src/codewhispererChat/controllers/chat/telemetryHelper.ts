/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { UserIntent } from '@amzn/codewhisperer-streaming'
import {
    AmazonqAddMessage,
    AmazonqInteractWithMessage,
    CwsprChatCommandType,
    CwsprChatTriggerInteraction,
    CwsprChatUserIntent,
    MetricBase,
    Result,
    telemetry,
} from '../../../shared/telemetry/telemetry'
import { ChatSessionStorage } from '../../storages/chatSession'
import {
    ChatItemFeedbackMessage,
    ChatItemVotedMessage,
    CopyCodeToClipboard,
    FooterInfoLinkClick,
    InsertCodeAtCursorPosition,
    PromptAnswer,
    PromptMessage,
    ResponseBodyLinkClickMessage,
    SourceLinkClickMessage,
    TriggerPayload,
} from './model'
import { TriggerEvent, TriggerEventsStorage } from '../../storages/triggerEvents'
import globals from '../../../shared/extensionGlobals'
import { getLogger } from '../../../shared/logger'
import { codeWhispererClient } from '../../../codewhisperer/client/codewhisperer'
import CodeWhispererUserClient, { Dimension } from '../../../codewhisperer/client/codewhispereruserclient'
import { isAwsError } from '../../../shared/errors'

const performance = globalThis.performance ?? require('perf_hooks').performance

export function mapToClientTelemetryEvent<T extends MetricBase>(
    name: string,
    event: T
): CodeWhispererUserClient.SendTelemetryEventRequest {
    return {
        telemetryEvent: {
            metricData: {
                metricName: name,
                metricValue: 1,
                timestamp: new Date(Date.now()),
                dimensions: Object.keys(event).map(
                    (key): Dimension => ({ name: key, value: event[key as keyof T]?.toString() })
                ),
            },
        },
    }
}

export function logSendTelemetryEventFailure(error: any) {
    let requestId: string | undefined
    if (isAwsError(error)) {
        requestId = error.requestId
    }

    getLogger().debug(
        `Failed to sendTelemetryEvent to CodeWhisperer, requestId: ${requestId ?? ''}, message: ${error.message}`
    )
}

export function recordTelemetryChatRunCommand(type: CwsprChatCommandType, command?: string) {
    telemetry.amazonq_runCommand.emit({
        result: 'Succeeded',
        cwsprChatCommandType: type,
        cwsprChatCommandName: command,
    })
}

export class CWCTelemetryHelper {
    private sessionStorage: ChatSessionStorage
    private triggerEventsStorage: TriggerEventsStorage
    private responseStreamStartTime: Map<string, number> = new Map()
    private responseStreamTotalTime: Map<string, number> = new Map()
    private responseStreamTimeForChunks: Map<string, number[]> = new Map()

    constructor(sessionStorage: ChatSessionStorage, triggerEventsStorage: TriggerEventsStorage) {
        this.sessionStorage = sessionStorage
        this.triggerEventsStorage = triggerEventsStorage
    }

    private getUserIntentForTelemetry(userIntent: UserIntent | undefined): CwsprChatUserIntent | undefined {
        switch (userIntent) {
            case UserIntent.EXPLAIN_CODE_SELECTION:
                return 'explainCodeSelection'
            case UserIntent.SUGGEST_ALTERNATE_IMPLEMENTATION:
                return 'suggestAlternateImplementation'
            case UserIntent.APPLY_COMMON_BEST_PRACTICES:
                return 'applyCommonBestPractices'
            case UserIntent.IMPROVE_CODE:
                return 'improveCode'
            case UserIntent.CITE_SOURCES:
                return 'citeSources'
            case UserIntent.EXPLAIN_LINE_BY_LINE:
                return 'explainLineByLine'
            case UserIntent.SHOW_EXAMPLES:
                return 'showExample'
            default:
                return undefined
        }
    }

    public recordOpenChat() {
        telemetry.amazonq_openChat.emit({ result: 'Succeeded' })
    }

    public recordCloseChat() {
        telemetry.amazonq_closeChat.emit({ result: 'Succeeded' })
    }

    public recordEnterFocusChat() {
        telemetry.amazonq_enterFocusChat.emit({ result: 'Succeeded' })
    }

    public recordExitFocusChat() {
        telemetry.amazonq_exitFocusChat.emit({ result: 'Succeeded' })
    }

    public async recordFeedback(message: ChatItemFeedbackMessage) {
        const logger = getLogger()
        try {
            await globals.telemetry.postFeedback({
                comment: JSON.stringify({
                    type: 'codewhisperer-chat-answer-feedback',
                    conversationId: this.getConversationId(message.tabID) ?? '',
                    messageId: message.messageId,
                    reason: message.selectedOption,
                    userComment: message.comment,
                }),
                sentiment: 'Negative',
            })
        } catch (err) {
            const errorMessage = (err as Error).message || 'Failed to submit feedback'
            logger.error(`CodeWhispererChat answer feedback failed: "Negative": ${errorMessage}`)

            this.recordFeedbackResult('Failed')

            return errorMessage
        }

        logger.info(`CodeWhispererChat answer feedback sent: "Negative"`)

        this.recordFeedbackResult('Succeeded')
    }

    public recordFeedbackResult(feedbackResult: Result) {
        telemetry.feedback_result.emit({ result: feedbackResult })
    }

    public recordInteractWithMessage(
        message:
            | InsertCodeAtCursorPosition
            | CopyCodeToClipboard
            | PromptMessage
            | ChatItemVotedMessage
            | SourceLinkClickMessage
            | ResponseBodyLinkClickMessage
            | FooterInfoLinkClick
    ) {
        const conversationId = this.getConversationId(message.tabID)
        let event: AmazonqInteractWithMessage | undefined
        switch (message.command) {
            case 'insert_code_at_cursor_position':
                message = message as InsertCodeAtCursorPosition
                event = {
                    cwsprChatConversationId: conversationId ?? '',
                    cwsprChatMessageId: message.messageId,
                    cwsprChatInteractionType: 'insertAtCursor',
                    cwsprChatAcceptedCharactersLength: message.code.length,
                    cwsprChatInteractionTarget: message.insertionTargetType,
                    cwsprChatHasReference: message.codeReference && message.codeReference.length > 0,
                }
                break
            case 'code_was_copied_to_clipboard':
                message = message as CopyCodeToClipboard
                event = {
                    cwsprChatConversationId: conversationId ?? '',
                    cwsprChatMessageId: message.messageId,
                    cwsprChatInteractionType: 'copySnippet',
                    cwsprChatAcceptedCharactersLength: message.code.length,
                    cwsprChatInteractionTarget: message.insertionTargetType,
                    cwsprChatHasReference: message.codeReference && message.codeReference.length > 0,
                }
                break
            case 'follow-up-was-clicked':
                message = message as PromptMessage
                event = {
                    cwsprChatConversationId: conversationId ?? '',
                    cwsprChatMessageId: message.messageId,
                    cwsprChatInteractionType: 'clickFollowUp',
                }
                break
            case 'chat-item-voted':
                message = message as ChatItemVotedMessage
                event = {
                    cwsprChatMessageId: message.messageId,
                    cwsprChatConversationId: conversationId ?? '',
                    cwsprChatInteractionType: message.vote,
                }
                break
            case 'source-link-click':
                message = message as SourceLinkClickMessage
                event = {
                    cwsprChatMessageId: message.messageId,
                    cwsprChatConversationId: conversationId ?? '',
                    cwsprChatInteractionType: 'clickLink',
                    cwsprChatInteractionTarget: message.link,
                }
                break
            case 'response-body-link-click':
                message = message as ResponseBodyLinkClickMessage
                event = {
                    cwsprChatMessageId: message.messageId,
                    cwsprChatConversationId: conversationId ?? '',
                    cwsprChatInteractionType: 'clickBodyLink',
                    cwsprChatInteractionTarget: message.link,
                }
                break
            case 'footer-info-link-click':
                message = message as FooterInfoLinkClick
                event = {
                    cwsprChatMessageId: 'footer',
                    cwsprChatConversationId: conversationId ?? '',
                    cwsprChatInteractionType: 'clickBodyLink',
                    cwsprChatInteractionTarget: message.link,
                }
                break
        }

        if (!event) {
            return
        }

        telemetry.amazonq_interactWithMessage.emit({ result: 'Succeeded', ...event })

        codeWhispererClient
            .sendTelemetryEvent(mapToClientTelemetryEvent('amazonq_interactWithMessage', event))
            .then()
            .catch(logSendTelemetryEventFailure)
    }

    public getTriggerInteractionFromTriggerEvent(triggerEvent: TriggerEvent | undefined): CwsprChatTriggerInteraction {
        switch (triggerEvent?.type) {
            case 'editor_context_command':
                return triggerEvent.command?.triggerType === 'keybinding' ? 'hotkeys' : 'contextMenu'
            case 'follow_up':
            case 'chat_message':
            default:
                return 'click'
        }
    }

    public recordStartConversation(triggerEvent: TriggerEvent, triggerPayload: TriggerPayload) {
        if (triggerEvent.tabID === undefined) {
            return
        }

        if (this.triggerEventsStorage.getTriggerEventsByTabID(triggerEvent.tabID).length > 1) {
            return
        }

        const telemetryUserIntent = this.getUserIntentForTelemetry(triggerPayload.userIntent)

        telemetry.amazonq_startConversation.emit({
            result: 'Succeeded',
            cwsprChatConversationId: this.getConversationId(triggerEvent.tabID) ?? '',
            cwsprChatTriggerInteraction: this.getTriggerInteractionFromTriggerEvent(triggerEvent),
            cwsprChatConversationType: 'Chat',
            cwsprChatUserIntent: telemetryUserIntent,
            cwsprChatHasCodeSnippet: triggerPayload.codeSelection && !triggerPayload.codeSelection.isEmpty,
            cwsprChatProgrammingLanguage: triggerPayload.fileLanguage,
        })
    }

    public recordAddMessage(triggerPayload: TriggerPayload, message: PromptAnswer) {
        const triggerEvent = this.triggerEventsStorage.getLastTriggerEventByTabID(message.tabID)

        const event: AmazonqAddMessage = {
            cwsprChatConversationId: this.getConversationId(message.tabID) ?? '',
            cwsprChatMessageId: message.messageID,
            cwsprChatTriggerInteraction: this.getTriggerInteractionFromTriggerEvent(triggerEvent),
            cwsprChatUserIntent: this.getUserIntentForTelemetry(triggerPayload.userIntent),
            cwsprChatHasCodeSnippet: triggerPayload.codeSelection && !triggerPayload.codeSelection.isEmpty,
            cwsprChatProgrammingLanguage: triggerPayload.fileLanguage,
            cwsprChatActiveEditorTotalCharacters: triggerPayload.fileText?.length,
            cwsprChatActiveEditorImportCount: triggerPayload.codeQuery?.fullyQualifiedNames?.used?.length,
            cwsprChatResponseCodeSnippetCount: 0, // TODO
            cwsprChatResponseCode: message.responseCode,
            cwsprChatSourceLinkCount: message.suggestionCount,
            cwsprChatReferencesCount: message.codeReferenceCount,
            cwsprChatFollowUpCount: message.followUpCount,
            cwsprChatTimeToFirstChunk: this.getResponseStreamTimeToFirstChunk(message.tabID),
            cwsprChatTimeBetweenChunks: '', // this.getResponseStreamTimeBetweenChunks(message.tabID), //TODO: allow '[', ']' and ',' chars
            cwsprChatFullResponseLatency: this.responseStreamTotalTime.get(message.tabID) ?? 0,
            cwsprChatRequestLength: triggerPayload.message?.length ?? 0,
            cwsprChatResponseLength: message.messageLength,
            cwsprChatConversationType: 'Chat',
        }

        telemetry.amazonq_addMessage.emit({ result: 'Succeeded', ...event })

        codeWhispererClient
            .sendTelemetryEvent(mapToClientTelemetryEvent('amazonq_addMessage', event))
            .then()
            .catch(logSendTelemetryEventFailure)
    }

    public recordMessageResponseError(triggerPayload: TriggerPayload, tabID: string, responseCode: number) {
        const triggerEvent = this.triggerEventsStorage.getLastTriggerEventByTabID(tabID)

        telemetry.amazonq_messageResponseError.emit({
            result: 'Succeeded',
            cwsprChatConversationId: this.getConversationId(tabID) ?? '',
            cwsprChatTriggerInteraction: this.getTriggerInteractionFromTriggerEvent(triggerEvent),
            cwsprChatUserIntent: this.getUserIntentForTelemetry(triggerPayload.userIntent),
            cwsprChatHasCodeSnippet: !triggerPayload.codeSelection?.isEmpty,
            cwsprChatProgrammingLanguage: triggerPayload.fileLanguage,
            cwsprChatActiveEditorTotalCharacters: triggerPayload.fileText?.length,
            cwsprChatActiveEditorImportCount: triggerPayload.codeQuery?.fullyQualifiedNames?.used?.length,
            cwsprChatResponseCode: responseCode,
            cwsprChatRequestLength: triggerPayload.message?.length ?? 0,
            cwsprChatConversationType: 'Chat',
        })
    }

    public recordEnterFocusConversation(tabID: string) {
        const conversationId = this.getConversationId(tabID)
        if (conversationId) {
            telemetry.amazonq_enterFocusConversation.emit({
                result: 'Succeeded',
                cwsprChatConversationId: conversationId,
            })
        }
    }

    public recordExitFocusConversation(tabID: string) {
        const conversationId = this.getConversationId(tabID)
        if (conversationId) {
            telemetry.amazonq_exitFocusConversation.emit({
                result: 'Succeeded',
                cwsprChatConversationId: conversationId,
            })
        }
    }

    public setResponseStreamStartTime(tabID: string) {
        this.responseStreamStartTime.set(tabID, performance.now())
        this.responseStreamTimeForChunks.set(tabID, [performance.now()])
    }

    public setResponseStreamTimeForChunks(tabID: string) {
        const chunkTimes = this.responseStreamTimeForChunks.get(tabID) ?? []
        this.responseStreamTimeForChunks.set(tabID, [...chunkTimes, performance.now()])
    }

    private getResponseStreamTimeToFirstChunk(tabID: string): number {
        const chunkTimes = this.responseStreamTimeForChunks.get(tabID) ?? [0, 0]
        if (chunkTimes.length === 1) {
            return Math.round(performance.now() - chunkTimes[0])
        }
        return Math.round(chunkTimes[1] - chunkTimes[0])
    }

    // private getResponseStreamTimeBetweenChunks(tabID: string): string {
    //     try {
    //         const chunkDeltaTimes: number[] = []
    //         const chunkTimes = this.responseStreamTimeForChunks.get(tabID) ?? [0]
    //         for (let idx = 0; idx < chunkTimes.length - 1; idx++) {
    //             chunkDeltaTimes.push(Math.round(chunkTimes[idx + 1] - chunkTimes[idx]))
    //         }

    //         const trimmed = JSON.stringify(chunkDeltaTimes).slice(0, 2_000)
    //         const fixed = trimmed.endsWith(',') ? trimmed.slice(0, -1) : trimmed
    //         return fixed.endsWith(']') ? fixed : `${fixed}]`
    //     } catch (e) {
    //         return '[-1]'
    //     }
    // }

    public setResponseStreamTotalTime(tabID: string) {
        const totalTime = performance.now() - (this.responseStreamStartTime.get(tabID) ?? 0)
        this.responseStreamTotalTime.set(tabID, Math.round(totalTime))
    }

    public getConversationId(tabID: string): string | undefined {
        return this.sessionStorage.getSession(tabID).sessionIdentifier
    }
}
