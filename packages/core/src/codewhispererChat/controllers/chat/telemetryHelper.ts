/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as path from 'path'
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
    AcceptDiff,
    ViewDiff,
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
    AdditionalContextLengths,
    AdditionalContextInfo,
} from './model'
import { TriggerEvent, TriggerEventsStorage } from '../../storages/triggerEvents'
import globals from '../../../shared/extensionGlobals'
import { getLogger } from '../../../shared/logger/logger'
import { codeWhispererClient } from '../../../codewhisperer/client/codewhisperer'
import { isAwsError } from '../../../shared/errors'
import CodeWhispererUserClient, {
    ChatMessageInteractionType,
} from '../../../codewhisperer/client/codewhispereruserclient'
import { supportedLanguagesList } from '../chat/chatRequest/converter'
import { AuthUtil } from '../../../codewhisperer/util/authUtil'
import { getSelectedCustomization } from '../../../codewhisperer/util/customizationUtil'
import { undefinedIfEmpty } from '../../../shared/utilities/textUtilities'
import { AdditionalContextPrompt } from '../../../amazonq/lsp/types'
import { getUserPromptsDirectory, promptFileExtension } from '../../constants'
import { isInDirectory } from '../../../shared/filesystemUtilities'
import { sleep } from '../../../shared/utilities/timeoutUtils'
import {
    FileDiagnostic,
    getDiagnosticsDifferences,
    getDiagnosticsOfCurrentFile,
    toIdeDiagnostics,
} from '../../../codewhisperer/util/diagnosticsUtil'
import { Auth } from '../../../auth/auth'

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
    private conversationStreamStartTime: Map<string, number> = new Map()
    private conversationStreamTotalTime: Map<string, number> = new Map()
    private responseStreamTimeForChunks: Map<string, number[]> = new Map()
    private responseWithContextInfo: Map<string, AdditionalContextInfo> = new Map()

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

    private documentDiagnostics: FileDiagnostic | undefined = undefined

    constructor(sessionStorage: ChatSessionStorage, triggerEventsStorage: TriggerEventsStorage) {
        this.sessionStorage = sessionStorage
        this.triggerEventsStorage = triggerEventsStorage
    }

    public setDocumentDiagnostics() {
        this.documentDiagnostics = getDiagnosticsOfCurrentFile()
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

    public getContextType(prompt: AdditionalContextPrompt): string {
        if (prompt.filePath.endsWith(promptFileExtension)) {
            if (isInDirectory(path.join('.amazonq', 'rules'), prompt.relativePath)) {
                return 'rule'
            } else if (isInDirectory(getUserPromptsDirectory(), prompt.filePath)) {
                return 'prompt'
            }
        }
        return 'file'
    }

    public getContextLengths(prompts: AdditionalContextPrompt[]): AdditionalContextLengths {
        let fileContextLength = 0
        let promptContextLength = 0
        let ruleContextLength = 0

        for (const prompt of prompts) {
            const type = this.getContextType(prompt)
            switch (type) {
                case 'rule':
                    ruleContextLength += prompt.content.length
                    break
                case 'file':
                    fileContextLength += prompt.content.length
                    break
                case 'prompt':
                    promptContextLength += prompt.content.length
                    break
            }
        }

        return { fileContextLength, promptContextLength, ruleContextLength }
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
            | AcceptDiff
            | InsertCodeAtCursorPosition
            | CopyCodeToClipboard
            | PromptMessage
            | ChatItemVotedMessage
            | SourceLinkClickMessage
            | ResponseBodyLinkClickMessage
            | FooterInfoLinkClick
            | ViewDiff,
        { result }: { result: Result } = { result: 'Succeeded' }
    ) {
        const conversationId = this.getConversationId(message.tabID)
        let event: AmazonqInteractWithMessage | undefined
        let additionalContextInfo = undefined
        const messageId = (message as any).messageId
        if (messageId) {
            additionalContextInfo = this.responseWithContextInfo.get(messageId)
        }
        switch (message.command) {
            case 'insert_code_at_cursor_position':
                message = message as InsertCodeAtCursorPosition
                event = {
                    result,
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
                    cwsprChatProgrammingLanguage: message.codeBlockLanguage,
                }
                break
            case 'code_was_copied_to_clipboard':
                message = message as CopyCodeToClipboard
                event = {
                    result,
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
                    cwsprChatProgrammingLanguage: message.codeBlockLanguage,
                }
                break
            case 'accept_diff':
                message = message as AcceptDiff
                event = {
                    result,
                    cwsprChatConversationId: conversationId ?? '',
                    cwsprChatMessageId: message.messageId,
                    cwsprChatInteractionType: 'acceptDiff',
                    credentialStartUrl: AuthUtil.instance.startUrl,
                    cwsprChatAcceptedCharactersLength: message.code.length,
                    cwsprChatHasReference:
                        message.referenceTrackerInformation && message.referenceTrackerInformation.length > 0,
                    cwsprChatCodeBlockIndex: message.codeBlockIndex,
                    cwsprChatTotalCodeBlocks: message.totalCodeBlocks,
                }
                break
            case 'view_diff':
                message = message as ViewDiff
                event = {
                    result,
                    cwsprChatConversationId: conversationId ?? '',
                    cwsprChatMessageId: message.messageId,
                    cwsprChatInteractionType: 'viewDiff',
                    credentialStartUrl: AuthUtil.instance.startUrl,
                    cwsprChatAcceptedCharactersLength: message.code.length,
                    cwsprChatHasReference:
                        message.referenceTrackerInformation && message.referenceTrackerInformation.length > 0,
                    cwsprChatCodeBlockIndex: message.codeBlockIndex,
                    cwsprChatTotalCodeBlocks: message.totalCodeBlocks,
                }
                break
            case 'follow-up-was-clicked':
                message = message as PromptMessage
                event = {
                    result,
                    cwsprChatConversationId: conversationId ?? '',
                    credentialStartUrl: AuthUtil.instance.startUrl,
                    cwsprChatMessageId: message.messageId,
                    cwsprChatInteractionType: 'clickFollowUp',
                }
                break
            case 'chat-item-voted':
                message = message as ChatItemVotedMessage
                event = {
                    result,
                    cwsprChatMessageId: message.messageId,
                    cwsprChatConversationId: conversationId ?? '',
                    credentialStartUrl: AuthUtil.instance.startUrl,
                    cwsprChatInteractionType: message.vote,
                }
                break
            case 'source-link-click':
                message = message as SourceLinkClickMessage
                event = {
                    result,
                    cwsprChatMessageId: message.messageId,
                    cwsprChatConversationId: conversationId ?? '',
                    credentialStartUrl: AuthUtil.instance.startUrl,
                    cwsprChatInteractionType: 'clickLink',
                    cwsprChatInteractionTarget: message.link,
                }
                break
            case 'response-body-link-click':
                message = message as ResponseBodyLinkClickMessage
                event = {
                    result,
                    cwsprChatMessageId: message.messageId,
                    cwsprChatConversationId: conversationId ?? '',
                    credentialStartUrl: AuthUtil.instance.startUrl,
                    cwsprChatInteractionType: 'clickBodyLink',
                    cwsprChatInteractionTarget: message.link,
                }
                break
            case 'footer-info-link-click':
                message = message as FooterInfoLinkClick
                event = {
                    result,
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
        telemetry.amazonq_interactWithMessage.emit({ ...event, ...additionalContextInfo })

        const interactWithMessageEvent: CodeWhispererUserClient.ChatInteractWithMessageEvent = {
            conversationId: event.cwsprChatConversationId,
            messageId: event.cwsprChatMessageId,
            interactionType: this.getCWClientTelemetryInteractionType(event.cwsprChatInteractionType),
            interactionTarget: event.cwsprChatInteractionTarget,
            acceptedCharacterCount: event.cwsprChatAcceptedCharactersLength,
            acceptedLineCount: event.cwsprChatAcceptedNumberOfLines,
            acceptedSnippetHasReference: false,
            hasProjectLevelContext: this.responseWithContextInfo.get(event.cwsprChatMessageId)
                ?.cwsprChatHasProjectContext,
            customizationArn: undefinedIfEmpty(getSelectedCustomization().arn),
        }
        if (interactWithMessageEvent.interactionType === 'INSERT_AT_CURSOR' && Auth.instance.isInternalAmazonUser()) {
            // wait 1 seconds for the user installed 3rd party LSP
            // to update its diagnostics.
            void sleep(1000).then(() => {
                const diagnosticDiff = getDiagnosticsDifferences(
                    this.documentDiagnostics,
                    getDiagnosticsOfCurrentFile()
                )
                interactWithMessageEvent.addedIdeDiagnostics = diagnosticDiff.added.map((it) => toIdeDiagnostics(it))
                interactWithMessageEvent.removedIdeDiagnostics = diagnosticDiff.removed.map((it) =>
                    toIdeDiagnostics(it)
                )
                codeWhispererClient
                    .sendTelemetryEvent({
                        telemetryEvent: {
                            chatInteractWithMessageEvent: interactWithMessageEvent,
                        },
                    })
                    .then()
                    .catch(logSendTelemetryEventFailure)
            })
        } else {
            codeWhispererClient
                .sendTelemetryEvent({
                    telemetryEvent: {
                        chatInteractWithMessageEvent: interactWithMessageEvent,
                    },
                    profileArn: AuthUtil.instance.regionProfileManager.activeRegionProfile?.arn,
                })
                .then()
                .catch(logSendTelemetryEventFailure)
        }
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
            case 'acceptDiff':
                return 'ACCEPT_DIFF'
            case 'viewDiff':
                return 'VIEW_DIFF'
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

    public getAdditionalContextCounts(triggerPayload: TriggerPayload) {
        const counts = {
            fileContextCount: 0,
            folderContextCount: 0,
            promptContextCount: 0,
        }

        if (triggerPayload.context) {
            for (const context of triggerPayload.context) {
                if (typeof context !== 'string') {
                    if (context.id === 'file') {
                        counts.fileContextCount++
                    } else if (context.id === 'folder') {
                        counts.folderContextCount++
                    } else if (context.id === 'prompt') {
                        counts.promptContextCount++
                    }
                }
            }
        }

        return counts
    }

    public emitAddMessage(tabID: string, fullDisplayLatency: number, traceId: string, startTime?: number) {
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

        const contextCounts = this.getAdditionalContextCounts(triggerPayload)

        const event: AmazonqAddMessage = {
            result: 'Succeeded',
            cwsprChatConversationId: this.getConversationId(message.tabID) ?? '',
            cwsprChatMessageId: message.messageID,
            cwsprChatTriggerInteraction: this.getTriggerInteractionFromTriggerEvent(triggerEvent),
            cwsprChatUserIntent: this.getUserIntentForTelemetry(triggerPayload.userIntent),
            cwsprChatHasCodeSnippet: triggerPayload.codeSelection && !triggerPayload.codeSelection.isEmpty,
            cwsprChatProgrammingLanguage: triggerPayload.fileLanguage,
            cwsprChatActiveEditorTotalCharacters: triggerPayload.fileText.length,
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
            cwsprChatTimeToFirstDisplay: this.getFirstDisplayTime(tabID, startTime),
            cwsprChatTimeToFirstUsableChunk: this.getFirstUsableChunkTime(message.tabID) ?? 0,
            cwsprChatFullServerResponseLatency: this.conversationStreamTotalTime.get(message.tabID) ?? 0,
            cwsprChatTimeBetweenDisplays: JSON.stringify(this.getTimeBetweenChunks(tabID, this.displayTimeForChunks)),
            cwsprChatFullDisplayLatency: fullDisplayLatency,
            cwsprChatRequestLength: triggerPayload.message.length,
            cwsprChatResponseLength: message.messageLength,
            cwsprChatConversationType: 'Chat',
            credentialStartUrl: AuthUtil.instance.startUrl,
            codewhispererCustomizationArn: triggerPayload.customization.arn,
            cwsprChatHasProjectContext: hasProjectLevelContext,
            cwsprChatHasContextList: triggerPayload.documentReferences.length > 0,
            cwsprChatFolderContextCount: contextCounts.folderContextCount,
            cwsprChatFileContextCount: contextCounts.fileContextCount,
            cwsprChatFileContextLength: triggerPayload.contextLengths.additionalContextLengths.fileContextLength,
            cwsprChatFileContextTruncatedLength:
                triggerPayload.contextLengths.truncatedAdditionalContextLengths.fileContextLength,
            cwsprChatRuleContextCount: triggerPayload.workspaceRulesCount,
            cwsprChatRuleContextLength: triggerPayload.contextLengths.additionalContextLengths.ruleContextLength,
            cwsprChatRuleContextTruncatedLength:
                triggerPayload.contextLengths.truncatedAdditionalContextLengths.ruleContextLength,
            cwsprChatPromptContextCount: contextCounts.promptContextCount,
            cwsprChatPromptContextLength: triggerPayload.contextLengths.additionalContextLengths.promptContextLength,
            cwsprChatPromptContextTruncatedLength:
                triggerPayload.contextLengths.truncatedAdditionalContextLengths.promptContextLength,
            cwsprChatFocusFileContextLength: triggerPayload.contextLengths.focusFileContextLength,
            cwsprChatFocusFileContextTruncatedLength: triggerPayload.contextLengths.truncatedFocusFileContextLength,
            cwsprChatUserInputContextLength: triggerPayload.contextLengths.userInputContextLength,
            cwsprChatUserInputContextTruncatedLength: triggerPayload.contextLengths.truncatedUserInputContextLength,
            cwsprChatWorkspaceContextLength: triggerPayload.contextLengths.workspaceContextLength,
            cwsprChatWorkspaceContextTruncatedLength: triggerPayload.contextLengths.truncatedWorkspaceContextLength,
            traceId,
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
                profileArn: AuthUtil.instance.regionProfileManager.activeRegionProfile?.arn,
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

    public setResponseFromAdditionalContext(messageId: string, additionalContextInfo: AdditionalContextInfo) {
        this.responseWithContextInfo.set(messageId, additionalContextInfo)
    }

    public setConversationStreamStartTime(tabID: string) {
        this.conversationStreamStartTime.set(tabID, performance.now())
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

    private getFirstUsableChunkTime(tabID: string) {
        const startTime = this.conversationStreamStartTime.get(tabID) ?? 0
        const chunkTimes = this.responseStreamTimeForChunks.get(tabID) ?? [0, 0]
        // first chunk is the start time, we use the second because thats the first actual usable chunk time
        return Math.round(chunkTimes[1] - startTime)
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
        // time from when the requests started streaming until the end of the stream
        const totalStreamingTime = performance.now() - (this.responseStreamStartTime.get(tabID) ?? 0)
        this.responseStreamTotalTime.set(tabID, Math.round(totalStreamingTime))

        // time from the initial server request, including creating the conversation id, until the end of the stream
        const totalConversationTime = performance.now() - (this.conversationStreamStartTime.get(tabID) ?? 0)
        this.conversationStreamTotalTime.set(tabID, Math.round(totalConversationTime))
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
