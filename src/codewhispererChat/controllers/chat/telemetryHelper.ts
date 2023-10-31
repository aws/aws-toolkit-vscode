/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { UserIntent } from '@amzn/codewhisperer-streaming'
import { CwsprChatTriggerInteraction, CwsprChatUserIntent, telemetry } from '../../../shared/telemetry/telemetry'
import { ChatSessionStorage } from '../../storages/chatSession'
import { CopyCodeToClipboard, InsertCodeAtCursorPosition, PromptAnswer, PromptMessage, TriggerPayload } from './model'
import { TriggerEvent, TriggerEventsStorage } from '../../storages/triggerEvents'
import globals from '../../../shared/extensionGlobals'

export class CWCTelemetryHelper {
    private sessionStorage: ChatSessionStorage
    private triggerEventsStorage: TriggerEventsStorage

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
            default:
                return undefined
        }
    }

    public recordOpenChat(triggerInteractionType: CwsprChatTriggerInteraction) {
        if (!globals.telemetry.telemetryEnabled) {
            return
        }

        telemetry.codewhispererchat_openChat.emit({ cwsprChatTriggerInteraction: triggerInteractionType })
    }

    public recordCloseChat() {
        if (!globals.telemetry.telemetryEnabled) {
            return
        }

        telemetry.codewhispererchat_closeChat.emit()
    }

    public recordEnterFocusChat() {
        if (!globals.telemetry.telemetryEnabled) {
            return
        }

        telemetry.codewhispererchat_enterFocusChat.emit()
    }

    public recordExitFocusChat() {
        if (!globals.telemetry.telemetryEnabled) {
            return
        }

        telemetry.codewhispererchat_exitFocusChat.emit()
    }

    public recordInteractWithMessage(message: InsertCodeAtCursorPosition | CopyCodeToClipboard | PromptMessage) {
        if (!globals.telemetry.telemetryEnabled) {
            return
        }

        const conversationId = this.getConversationId(message.tabID)

        switch (message.command) {
            case 'insert_code_at_cursor_position':
                //TODO: message id and has reference
                message = message as InsertCodeAtCursorPosition
                telemetry.codewhispererchat_interactWithMessage.emit({
                    cwsprChatConversationId: conversationId ?? '',
                    cwsprChatMessageId: '',
                    cwsprChatInteractionType: 'insertAtCursor',
                    cwsprChatAcceptedCharactersLength: message.code.length,
                    cwsprChatInteractionTarget: message.insertionTargetType,
                    cwsprChatHasReference: undefined,
                })
                break
            case 'code_was_copied_to_clipboard':
                //TODO: message id and has reference
                message = message as CopyCodeToClipboard
                telemetry.codewhispererchat_interactWithMessage.emit({
                    cwsprChatConversationId: conversationId ?? '',
                    cwsprChatMessageId: '',
                    cwsprChatInteractionType: 'copySnippet',
                    cwsprChatAcceptedCharactersLength: message.code.length,
                    cwsprChatInteractionTarget: message.insertionTargetType,
                    cwsprChatHasReference: undefined,
                })
                break
            case 'follow-up-was-clicked':
                //TODO: message id
                message = message as PromptMessage
                telemetry.codewhispererchat_interactWithMessage.emit({
                    cwsprChatConversationId: conversationId ?? '',
                    cwsprChatMessageId: '',
                    cwsprChatInteractionType: 'clickFollowUp',
                })
        }
    }

    public recordStartConversation(triggerEvent: TriggerEvent, triggerPayload: TriggerPayload) {
        if (!globals.telemetry.telemetryEnabled) {
            return
        }

        if (triggerEvent.tabID == undefined) {
            return
        }

        if (this.triggerEventsStorage.getTriggerEventsByTabID(triggerEvent.tabID).length > 1) {
            return
        }

        const telemetryUserIntent = this.getUserIntentForTelemetry(triggerPayload.userIntent)

        telemetry.codewhispererchat_startConversation.emit({
            cwsprChatConversationId: this.getConversationId(triggerEvent.tabID) ?? '',
            cwsprChatConversationType: 'Chat',
            cwsprChatUserIntent: telemetryUserIntent,
            cwsprChatHasCodeSnippet: triggerPayload.codeSelection != undefined,
            cwsprChatProgrammingLanguage: triggerPayload.fileLanguage,
        })
    }

    public recordAddMessage(triggerPayload: TriggerPayload | undefined, message: PromptAnswer) {
        if (!globals.telemetry.telemetryEnabled) {
            return
        }

        const hasCodeSnippet = !triggerPayload?.codeSelection?.isEmpty

        // TODO: add mesasge id, user intent, response code snippet count, response code, references count, time to first chunk, response latency
        telemetry.codewhispererchat_addMessage.emit({
            cwsprChatConversationId: this.getConversationId(message.tabID) ?? '',
            cwsprChatMessageId: '',
            cwsprChatUserIntent: undefined,
            cwsprChatHasCodeSnippet: hasCodeSnippet,
            cwsprChatProgrammingLanguage: triggerPayload?.fileLanguage,
            cwsprChatActiveEditorTotalCharacters: triggerPayload?.fileText?.length ?? 0,
            cwsprChatActiveEditorImportCount: triggerPayload?.matchPolicy?.must?.length ?? 0,
            cwsprChatResponseCodeSnippetCount: 0,
            cwsprChatResponseCode: 0,
            cwsprChatSourceLinkCount: message.suggestionCount,
            cwsprChatReferencesCount: 0,
            cwsprChatFollowUpCount: message.followUpCount,
            cwsprChatTimeToFirstChunk: 0,
            cwsprChatFullResponseLatency: 0,
            cwsprChatResponseLength: message.messageLength,
            cwsprChatConversationType: 'Chat',
        })
    }

    public recordEnterFocusConversation(tabID: string) {
        if (!globals.telemetry.telemetryEnabled) {
            return
        }

        telemetry.codewhispererchat_enterFocusConversation.emit({
            cwsprChatConversationId: this.getConversationId(tabID) ?? '',
        })
    }

    public recordExitFocusConversation(tabID: string) {
        if (!globals.telemetry.telemetryEnabled) {
            return
        }

        telemetry.codewhispererchat_exitFocusConversation.emit({
            cwsprChatConversationId: this.getConversationId(tabID) ?? '',
        })
    }

    private getConversationId(tabID: string): string | undefined {
        return this.sessionStorage.getSession(tabID).sessionIdentifier
    }
}
