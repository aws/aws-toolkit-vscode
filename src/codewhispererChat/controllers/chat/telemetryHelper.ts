/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { UserIntent } from '@amzn/codewhisperer-streaming'
import {
    CodewhispererchatAddMessage,
    CodewhispererchatInteractWithMessage,
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
    ClickLink,
    CopyCodeToClipboard,
    InsertCodeAtCursorPosition,
    PromptAnswer,
    PromptMessage,
    TriggerPayload,
} from './model'
import { TriggerEvent, TriggerEventsStorage } from '../../storages/triggerEvents'
import globals from '../../../shared/extensionGlobals'
import { getLogger } from '../../../shared/logger'
import { TabOpenType } from '../../../amazonq/webview/ui/storages/tabsStorage'
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

export class CWCTelemetryHelper {
    private sessionStorage: ChatSessionStorage
    private triggerEventsStorage: TriggerEventsStorage
    private responseStreamStartTime: Map<string, number> = new Map()
    private responseStreamTotalTime: Map<string, number> = new Map()
    private responseStreamTimeToFirstChunk: Map<string, number | undefined> = new Map()

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
        telemetry.codewhispererchat_openChat.emit()
    }

    public recordCloseChat() {
        telemetry.codewhispererchat_closeChat.emit()
    }

    public recordEnterFocusChat() {
        telemetry.codewhispererchat_enterFocusChat.emit()
    }

    public recordExitFocusChat() {
        telemetry.codewhispererchat_exitFocusChat.emit()
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
        message: InsertCodeAtCursorPosition | CopyCodeToClipboard | PromptMessage | ChatItemVotedMessage | ClickLink
    ) {
        const conversationId = this.getConversationId(message.tabID)
        let event: CodewhispererchatInteractWithMessage | undefined
        switch (message.command) {
            case 'insert_code_at_cursor_position':
                message = message as InsertCodeAtCursorPosition
                event = {
                    cwsprChatConversationId: conversationId ?? '',
                    cwsprChatMessageId: message.messageId,
                    cwsprChatInteractionType: 'insertAtCursor',
                    cwsprChatAcceptedCharactersLength: message.code.length,
                    cwsprChatInteractionTarget: message.insertionTargetType,
                    cwsprChatHasReference: undefined, //TODO
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
                    cwsprChatHasReference: undefined, //TODO
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
            case 'link-was-clicked':
                message = message as ClickLink
                event = {
                    cwsprChatMessageId: message.messageId,
                    cwsprChatConversationId: conversationId ?? '',
                    cwsprChatInteractionType: 'clickLink',
                    cwsprChatInteractionTarget: message.url,
                }
                break
        }

        if (!event) {
            return
        }

        telemetry.codewhispererchat_interactWithMessage.emit(event)

        codeWhispererClient
            .sendTelemetryEvent(mapToClientTelemetryEvent('codewhispererchat_interactWithMessage', event))
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

        telemetry.codewhispererchat_startConversation.emit({
            cwsprChatConversationId: this.getConversationId(triggerEvent.tabID) ?? '',
            cwsprChatTriggerInteraction: this.getTriggerInteractionFromTriggerEvent(triggerEvent),
            cwsprChatConversationType: 'Chat',
            cwsprChatUserIntent: telemetryUserIntent,
            cwsprChatHasCodeSnippet: triggerPayload.codeSelection !== undefined,
            cwsprChatProgrammingLanguage: triggerPayload.fileLanguage,
        })
    }

    public recordAddMessage(triggerPayload: TriggerPayload, message: PromptAnswer) {
        const triggerEvent = this.triggerEventsStorage.getLastTriggerEventByTabID(message.tabID)

        const event: CodewhispererchatAddMessage = {
            cwsprChatConversationId: this.getConversationId(message.tabID) ?? '',
            cwsprChatMessageId: message.messageID,
            cwsprChatTriggerInteraction: this.getTriggerInteractionFromTriggerEvent(triggerEvent),
            cwsprChatUserIntent: this.getUserIntentForTelemetry(triggerPayload.userIntent),
            cwsprChatHasCodeSnippet: !triggerPayload.codeSelection?.isEmpty,
            cwsprChatProgrammingLanguage: triggerPayload.fileLanguage,
            cwsprChatActiveEditorTotalCharacters: triggerPayload.fileText?.length,
            cwsprChatActiveEditorImportCount: triggerPayload.codeQuery?.fullyQualifiedNames?.used?.length,
            cwsprChatResponseCodeSnippetCount: 0, // TODO
            cwsprChatResponseCode: message.responseCode,
            cwsprChatSourceLinkCount: message.suggestionCount,
            cwsprChatReferencesCount: message.codeReferenceCount,
            cwsprChatFollowUpCount: message.followUpCount,
            cwsprChatTimeToFirstChunk: this.responseStreamTimeToFirstChunk.get(message.tabID) ?? 0,
            cwsprChatFullResponseLatency: this.responseStreamTotalTime.get(message.tabID) ?? 0,
            cwsprChatRequestLength: triggerPayload.message?.length ?? 0,
            cwsprChatResponseLength: message.messageLength,
            cwsprChatConversationType: 'Chat',
        }

        telemetry.codewhispererchat_addMessage.emit(event)

        codeWhispererClient
            .sendTelemetryEvent(mapToClientTelemetryEvent('codewhispererchat_addMessage', event))
            .then()
            .catch(logSendTelemetryEventFailure)
    }

    public recordMessageResponseError(triggerPayload: TriggerPayload, tabID: string, responseCode: number) {
        const triggerEvent = this.triggerEventsStorage.getLastTriggerEventByTabID(tabID)

        telemetry.codewhispererchat_messageResponseError.emit({
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
            telemetry.codewhispererchat_enterFocusConversation.emit({
                cwsprChatConversationId: conversationId,
            })
        }
    }

    public recordExitFocusConversation(tabID: string) {
        const conversationId = this.getConversationId(tabID)
        if (conversationId) {
            telemetry.codewhispererchat_exitFocusConversation.emit({
                cwsprChatConversationId: conversationId,
            })
        }
    }

    public setResponseStreamStartTime(tabID: string) {
        this.responseStreamStartTime.set(tabID, performance.now())
        this.responseStreamTimeToFirstChunk.set(tabID, undefined)
    }

    public setResponseStreamTimeToFirstChunk(tabID: string) {
        if (this.responseStreamTimeToFirstChunk.get(tabID) === undefined) {
            this.responseStreamTimeToFirstChunk.set(
                tabID,
                performance.now() - (this.responseStreamStartTime.get(tabID) ?? 0)
            )
        }
    }

    public setResponseStreamTotalTime(tabID: string) {
        this.responseStreamTotalTime.set(tabID, performance.now() - (this.responseStreamStartTime.get(tabID) ?? 0))
    }

    public getConversationId(tabID: string): string | undefined {
        return this.sessionStorage.getSession(tabID).sessionIdentifier
    }
}
