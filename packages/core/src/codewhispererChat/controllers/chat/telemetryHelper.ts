/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { UserIntent } from '@amzn/codewhisperer-streaming'
import {
    AmazonqAddMessage,
    AmazonqInteractWithMessage,
    CwsprChatCommandType,
    CwsprChatInteractionType,
    CwsprChatTriggerInteraction,
    CwsprChatUserIntent,
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
import { isAwsError } from '../../../shared/errors'
import { ChatMessageInteractionType } from '../../../codewhisperer/client/codewhispereruserclient'
import { supportedLanguagesList } from '../chat/chatRequest/converter'
import { AuthUtil } from '../../../codewhisperer/util/authUtil'
import { getSelectedCustomization } from '../../../codewhisperer/util/customizationUtil'
import { undefinedIfEmpty } from '../../../shared'

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
        credentialStartUrl: AuthUtil.instance.startUrl,
    })
}

export class CWCTelemetryHelper {
    static instance: CWCTelemetryHelper
    private sessionStorage: ChatSessionStorage
    private triggerEventsStorage: TriggerEventsStorage
    private responseStreamStartTime: Map<string, number> = new Map()
    private responseStreamTotalTime: Map<string, number> = new Map()
    private responseStreamTimeForChunks: Map<string, number[]> = new Map()
    private responseWithProjectContext: Map<string, boolean> = new Map()

    // Keeps track of when chunks of data were displayed in a tab
    private displayTimeForChunks: Map<string, number[]> = new Map()

    /**
     * Stores payload information about a message response until
     * the full round trip time finishes and addMessage telemetry
     * is sent
     */
    private messageStorage: Map<
        string,
        {
            triggerPayload: TriggerPayload
            message: PromptAnswer
        }
    > = new Map()

    constructor(sessionStorage: ChatSessionStorage, triggerEventsStorage: TriggerEventsStorage) {
        this.sessionStorage = sessionStorage
        this.triggerEventsStorage = triggerEventsStorage
    }

    public static init(sessionStorage: ChatSessionStorage, triggerEventsStorage: TriggerEventsStorage) {
        const lastInstance = CWCTelemetryHelper.instance
        if (lastInstance !== undefined) {
            return lastInstance
        }

        getLogger().debug('CWCTelemetryHelper: Initialized new telemetry helper')
        const instance = new CWCTelemetryHelper(sessionStorage, triggerEventsStorage)
        CWCTelemetryHelper.instance = instance
        return instance
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
            case UserIntent.GENERATE_UNIT_TESTS:
                return 'generateUnitTests'
            default:
                return undefined
        }
    }

    public recordOpenChat() {
        telemetry.amazonq_openChat.emit({ result: 'Succeeded', passive: true })
    }

    public recordCloseChat() {
        telemetry.amazonq_closeChat.emit({ result: 'Succeeded', passive: true })
    }

    public recordEnterFocusChat() {
        telemetry.amazonq_enterFocusChat.emit({ result: 'Succeeded', passive: true })
    }

    public recordExitFocusChat() {
        telemetry.amazonq_exitFocusChat.emit({ result: 'Succeeded', passive: true })
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

    private recordFeedbackResult(feedbackResult: Result) {
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
                    result: 'Succeeded',
                    cwsprChatConversationId: conversationId ?? '',
                    credentialStartUrl: AuthUtil.instance.startUrl,
                    cwsprChatMessageId: message.messageId,
                    cwsprChatUserIntent: this.getUserIntentForTelemetry(message.userIntent),
                    cwsprChatInteractionType: 'insertAtCursor',
                    cwsprChatAcceptedCharactersLength: message.code.length,
                    cwsprChatAcceptedNumberOfLines: message.code.split('\n').length,
                    cwsprChatInteractionTarget: message.insertionTargetType,
                    cwsprChatHasReference: message.codeReference && message.codeReference.length > 0,
                    cwsprChatCodeBlockIndex: message.codeBlockIndex,
                    cwsprChatTotalCodeBlocks: message.totalCodeBlocks,
                    cwsprChatHasProjectContext: this.responseWithProjectContext.get(message.messageId),
                }
                break
            case 'code_was_copied_to_clipboard':
                message = message as CopyCodeToClipboard
                event = {
                    result: 'Succeeded',
                    cwsprChatConversationId: conversationId ?? '',
                    credentialStartUrl: AuthUtil.instance.startUrl,
                    cwsprChatMessageId: message.messageId,
                    cwsprChatUserIntent: this.getUserIntentForTelemetry(message.userIntent),
                    cwsprChatInteractionType: 'copySnippet',
                    cwsprChatAcceptedCharactersLength: message.code.length,
                    cwsprChatInteractionTarget: message.insertionTargetType,
                    cwsprChatHasReference: message.codeReference && message.codeReference.length > 0,
                    cwsprChatCodeBlockIndex: message.codeBlockIndex,
                    cwsprChatTotalCodeBlocks: message.totalCodeBlocks,
                    cwsprChatHasProjectContext: this.responseWithProjectContext.get(message.messageId),
                }
                break
            case 'follow-up-was-clicked':
                message = message as PromptMessage
                event = {
                    result: 'Succeeded',
                    cwsprChatConversationId: conversationId ?? '',
                    credentialStartUrl: AuthUtil.instance.startUrl,
                    cwsprChatMessageId: message.messageId,
                    cwsprChatInteractionType: 'clickFollowUp',
                    cwsprChatHasProjectContext: this.responseWithProjectContext.get(message.messageId),
                }
                break
            case 'chat-item-voted':
                message = message as ChatItemVotedMessage
                event = {
                    result: 'Succeeded',
                    cwsprChatMessageId: message.messageId,
                    cwsprChatConversationId: conversationId ?? '',
                    credentialStartUrl: AuthUtil.instance.startUrl,
                    cwsprChatInteractionType: message.vote,
                    cwsprChatHasProjectContext: this.responseWithProjectContext.get(message.messageId),
                }
                break
            case 'source-link-click':
                message = message as SourceLinkClickMessage
                event = {
                    result: 'Succeeded',
                    cwsprChatMessageId: message.messageId,
                    cwsprChatConversationId: conversationId ?? '',
                    credentialStartUrl: AuthUtil.instance.startUrl,
                    cwsprChatInteractionType: 'clickLink',
                    cwsprChatInteractionTarget: message.link,
                    cwsprChatHasProjectContext: this.responseWithProjectContext.get(message.messageId),
                }
                break
            case 'response-body-link-click':
                message = message as ResponseBodyLinkClickMessage
                event = {
                    result: 'Succeeded',
                    cwsprChatMessageId: message.messageId,
                    cwsprChatConversationId: conversationId ?? '',
                    credentialStartUrl: AuthUtil.instance.startUrl,
                    cwsprChatInteractionType: 'clickBodyLink',
                    cwsprChatInteractionTarget: message.link,
                    cwsprChatHasProjectContext: this.responseWithProjectContext.get(message.messageId),
                }
                break
            case 'footer-info-link-click':
                message = message as FooterInfoLinkClick
                event = {
                    result: 'Succeeded',
                    cwsprChatMessageId: 'footer',
                    cwsprChatConversationId: conversationId ?? '',
                    credentialStartUrl: AuthUtil.instance.startUrl,
                    cwsprChatInteractionType: 'clickBodyLink',
                    cwsprChatInteractionTarget: message.link,
                }
                break
        }

        if (!event) {
            return
        }
        telemetry.amazonq_interactWithMessage.emit(event)

        codeWhispererClient
            .sendTelemetryEvent({
                telemetryEvent: {
                    chatInteractWithMessageEvent: {
                        conversationId: event.cwsprChatConversationId,
                        messageId: event.cwsprChatMessageId,
                        interactionType: this.getCWClientTelemetryInteractionType(event.cwsprChatInteractionType),
                        interactionTarget: event.cwsprChatInteractionTarget,
                        acceptedCharacterCount: event.cwsprChatAcceptedCharactersLength,
                        acceptedLineCount: event.cwsprChatAcceptedNumberOfLines,
                        acceptedSnippetHasReference: false,
                        hasProjectLevelContext: this.responseWithProjectContext.get(event.cwsprChatMessageId),
                        customizationArn: undefinedIfEmpty(getSelectedCustomization().arn),
                    },
                },
            })
            .then()
            .catch(logSendTelemetryEventFailure)
    }

    private getCWClientTelemetryInteractionType(type: CwsprChatInteractionType): ChatMessageInteractionType {
        switch (type) {
            case 'copySnippet':
                return 'COPY_SNIPPET'
            case 'insertAtCursor':
                return 'INSERT_AT_CURSOR'
            case 'clickFollowUp':
                return 'CLICK_FOLLOW_UP'
            case 'clickLink':
                return 'CLICK_LINK'
            case 'clickBodyLink':
                return 'CLICK_BODY_LINK'
            case 'upvote':
                return 'UPVOTE'
            case 'downvote':
                return 'DOWNVOTE'
            default:
                return 'UNKNOWN'
        }
    }

    private getTriggerInteractionFromTriggerEvent(triggerEvent: TriggerEvent | undefined): CwsprChatTriggerInteraction {
        switch (triggerEvent?.type) {
            case 'editor_context_command':
                return triggerEvent.command?.triggerType === 'keybinding' ? 'hotkeys' : 'contextMenu'
            case 'follow_up':
            case 'chat_message':
            default:
                return 'click'
        }
    }

    public recordStartConversation(
        triggerEvent: TriggerEvent,
        triggerPayload: TriggerPayload & { projectContextQueryLatencyMs?: number }
    ) {
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
            credentialStartUrl: AuthUtil.instance.startUrl,
            cwsprChatHasProjectContext: triggerPayload.relevantTextDocuments
                ? triggerPayload.relevantTextDocuments.length > 0 && triggerPayload.useRelevantDocuments === true
                : false,
            cwsprChatProjectContextQueryMs: triggerPayload.projectContextQueryLatencyMs,
        })
    }

    /**
     * Store the trigger payload and message until the full message round trip finishes
     *
     * @calls emitAddMessage when the full message round trip finishes
     */
    public recordAddMessage(triggerPayload: TriggerPayload, message: PromptAnswer) {
        this.messageStorage.set(message.tabID, {
            triggerPayload,
            message,
        })
    }

    public emitAddMessage(tabID: string, fullDisplayLatency: number, startTime?: number) {
        const payload = this.messageStorage.get(tabID)
        if (!payload) {
            return
        }

        const { triggerPayload, message } = payload

        const triggerEvent = this.triggerEventsStorage.getLastTriggerEventByTabID(message.tabID)
        const hasProjectLevelContext =
            triggerPayload.relevantTextDocuments &&
            triggerPayload.relevantTextDocuments.length > 0 &&
            triggerPayload.useRelevantDocuments === true
        const event: AmazonqAddMessage = {
            result: 'Succeeded',
            cwsprChatConversationId: this.getConversationId(message.tabID) ?? '',
            cwsprChatMessageId: message.messageID,
            cwsprChatTriggerInteraction: this.getTriggerInteractionFromTriggerEvent(triggerEvent),
            cwsprChatUserIntent: this.getUserIntentForTelemetry(triggerPayload.userIntent),
            cwsprChatHasCodeSnippet: triggerPayload.codeSelection && !triggerPayload.codeSelection.isEmpty,
            cwsprChatProgrammingLanguage: triggerPayload.fileLanguage,
            cwsprChatActiveEditorTotalCharacters: triggerPayload.fileText?.length,
            cwsprChatActiveEditorImportCount: triggerPayload.codeQuery?.fullyQualifiedNames?.used?.length,
            cwsprChatResponseCodeSnippetCount: message.totalNumberOfCodeBlocksInResponse,
            cwsprChatResponseCode: message.responseCode,
            cwsprChatSourceLinkCount: message.suggestionCount,
            cwsprChatReferencesCount: message.codeReferenceCount,
            cwsprChatFollowUpCount: message.followUpCount,
            cwsprChatTimeToFirstChunk: this.getResponseStreamTimeToFirstChunk(message.tabID),
            cwsprChatTimeBetweenChunks: JSON.stringify(
                this.getTimeBetweenChunks(message.tabID, this.responseStreamTimeForChunks)
            ),
            cwsprChatFullResponseLatency: this.responseStreamTotalTime.get(message.tabID) ?? 0,
            cwsprTimeToFirstDisplay: this.getFirstDisplayTime(tabID, startTime),
            cwsprChatTimeBetweenDisplays: JSON.stringify(this.getTimeBetweenChunks(tabID, this.displayTimeForChunks)),
            cwsprChatFullDisplayLatency: fullDisplayLatency,
            cwsprChatRequestLength: triggerPayload.message?.length ?? 0,
            cwsprChatResponseLength: message.messageLength,
            cwsprChatConversationType: 'Chat',
            credentialStartUrl: AuthUtil.instance.startUrl,
            codewhispererCustomizationArn: triggerPayload.customization.arn,
            cwsprChatHasProjectContext: hasProjectLevelContext,
        }

        telemetry.amazonq_addMessage.emit(event)
        const language = this.isProgrammingLanguageSupported(triggerPayload.fileLanguage)
            ? { languageName: triggerPayload.fileLanguage as string }
            : undefined

        codeWhispererClient
            .sendTelemetryEvent({
                telemetryEvent: {
                    chatAddMessageEvent: {
                        conversationId: event.cwsprChatConversationId,
                        messageId: event.cwsprChatMessageId,
                        userIntent: triggerPayload.userIntent,
                        hasCodeSnippet: event.cwsprChatHasCodeSnippet,
                        ...(language !== undefined ? { programmingLanguage: language } : {}),
                        activeEditorTotalCharacters: event.cwsprChatActiveEditorTotalCharacters,
                        timeToFirstChunkMilliseconds: event.cwsprChatTimeToFirstChunk,
                        timeBetweenChunks: this.getTimeBetweenChunks(message.tabID, this.responseStreamTimeForChunks),
                        fullResponselatency: event.cwsprChatFullResponseLatency,
                        requestLength: event.cwsprChatRequestLength,
                        responseLength: event.cwsprChatResponseLength,
                        numberOfCodeBlocks: event.cwsprChatResponseCodeSnippetCount,
                        hasProjectLevelContext: hasProjectLevelContext,
                        customizationArn: undefinedIfEmpty(getSelectedCustomization().arn),
                    },
                },
            })
            .then()
            .catch(logSendTelemetryEventFailure)

        this.messageStorage.delete(tabID)
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
            credentialStartUrl: AuthUtil.instance.startUrl,
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
        this.displayTimeForChunks.set(tabID, [])
    }

    public setResponseStreamTimeForChunks(tabID: string) {
        const chunkTimes = this.responseStreamTimeForChunks.get(tabID) ?? []
        this.responseStreamTimeForChunks.set(tabID, [...chunkTimes, performance.now()])
    }

    public setDisplayTimeForChunks(tabID: string, time: number) {
        const chunkTimes = this.displayTimeForChunks.get(tabID) ?? []
        this.displayTimeForChunks.set(tabID, [...chunkTimes, time])
    }

    public setResponseFromProjectContext(messageId: string) {
        this.responseWithProjectContext.set(messageId, true)
    }

    private getResponseStreamTimeToFirstChunk(tabID: string): number {
        const chunkTimes = this.responseStreamTimeForChunks.get(tabID) ?? [0, 0]
        if (chunkTimes.length === 1) {
            return Math.round(performance.now() - chunkTimes[0])
        }
        return Math.round(chunkTimes[1] - chunkTimes[0])
    }

    /**
     * Finds the time between when a user pressed enter and the first chunk appears in the UI
     */
    private getFirstDisplayTime(tabID: string, startTime?: number) {
        if (!startTime) {
            return 0
        }
        const chunkTimes = this.displayTimeForChunks.get(tabID) ?? [0]
        return Math.round(chunkTimes[0] - startTime)
    }

    private getTimeBetweenChunks(tabID: string, chunks: Map<string, number[]>): number[] {
        try {
            const chunkDeltaTimes: number[] = []
            const chunkTimes = chunks.get(tabID) ?? [0]
            for (let idx = 0; idx < chunkTimes.length - 1; idx++) {
                chunkDeltaTimes.push(Math.round(chunkTimes[idx + 1] - chunkTimes[idx]))
            }

            return chunkDeltaTimes.slice(0, 100)
        } catch (e) {
            getLogger().debug(`Failed to get response time between chunks, message: ${e}`)
            return []
        }
    }

    public setResponseStreamTotalTime(tabID: string) {
        const totalTime = performance.now() - (this.responseStreamStartTime.get(tabID) ?? 0)
        this.responseStreamTotalTime.set(tabID, Math.round(totalTime))
    }

    public getConversationId(tabID: string): string | undefined {
        return this.sessionStorage.getSession(tabID).sessionIdentifier
    }

    private isProgrammingLanguageSupported(programmingLanguage: string | undefined) {
        return (
            programmingLanguage !== undefined &&
            programmingLanguage !== '' &&
            supportedLanguagesList.includes(programmingLanguage)
        )
    }
}
