// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc.controller.chat.telemetry

import software.amazon.awssdk.services.codewhispererruntime.model.ChatInteractWithMessageEvent
import software.amazon.awssdk.services.codewhispererruntime.model.ChatMessageInteractionType
import software.amazon.awssdk.services.codewhispererstreaming.model.UserIntent
import software.amazon.awssdk.services.toolkittelemetry.model.Sentiment
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.services.amazonq.apps.AmazonQAppInitContext
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererClientAdaptor
import software.aws.toolkits.jetbrains.services.cwc.clients.chat.model.ChatRequestData
import software.aws.toolkits.jetbrains.services.cwc.clients.chat.model.TriggerType
import software.aws.toolkits.jetbrains.services.cwc.clients.chat.v1.ChatSessionV1
import software.aws.toolkits.jetbrains.services.cwc.controller.ChatController
import software.aws.toolkits.jetbrains.services.cwc.messages.ChatMessage
import software.aws.toolkits.jetbrains.services.cwc.messages.IncomingCwcMessage
import software.aws.toolkits.jetbrains.services.cwc.messages.LinkType
import software.aws.toolkits.jetbrains.services.cwc.storage.ChatSessionStorage
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryService
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.AmazonqTelemetry
import software.aws.toolkits.telemetry.CwsprChatCommandType
import software.aws.toolkits.telemetry.CwsprChatConversationType
import software.aws.toolkits.telemetry.CwsprChatInteractionType
import software.aws.toolkits.telemetry.CwsprChatTriggerInteraction
import software.aws.toolkits.telemetry.CwsprChatUserIntent
import software.aws.toolkits.telemetry.FeedbackTelemetry
import java.time.Duration
import java.time.Instant
import software.amazon.awssdk.services.codewhispererruntime.model.UserIntent as CWClientUserIntent

class TelemetryHelper(private val context: AmazonQAppInitContext, private val sessionStorage: ChatSessionStorage) {

    private val responseStreamStartTime: MutableMap<String, Instant> = mutableMapOf()
    private val responseStreamTotalTime: MutableMap<String, Int> = mutableMapOf()
    private val responseStreamTimeForChunks: MutableMap<String, MutableList<Instant>> = mutableMapOf()

    fun getConversationId(tabId: String): String? = sessionStorage.getSession(tabId)?.session?.conversationId

    private fun getTelemetryUserIntent(userIntent: UserIntent): CwsprChatUserIntent = when (userIntent) {
        UserIntent.SUGGEST_ALTERNATE_IMPLEMENTATION -> CwsprChatUserIntent.SuggestAlternateImplementation
        UserIntent.APPLY_COMMON_BEST_PRACTICES -> CwsprChatUserIntent.ApplyCommonBestPractices
        UserIntent.IMPROVE_CODE -> CwsprChatUserIntent.ImproveCode
        UserIntent.SHOW_EXAMPLES -> CwsprChatUserIntent.ShowExample
        UserIntent.CITE_SOURCES -> CwsprChatUserIntent.CiteSources
        UserIntent.EXPLAIN_LINE_BY_LINE -> CwsprChatUserIntent.ExplainLineByLine
        UserIntent.EXPLAIN_CODE_SELECTION -> CwsprChatUserIntent.ExplainCodeSelection
        UserIntent.UNKNOWN_TO_SDK_VERSION -> CwsprChatUserIntent.Unknown
    }

    private fun getTelemetryTriggerType(triggerType: TriggerType): CwsprChatTriggerInteraction = when (triggerType) {
        TriggerType.Click -> CwsprChatTriggerInteraction.Click
        TriggerType.ContextMenu, TriggerType.Hotkeys -> CwsprChatTriggerInteraction.ContextMenu
    }

    // When chat panel is focused
    fun recordEnterFocusChat() {
        AmazonqTelemetry.enterFocusChat(passive = true)
    }

    // When chat panel is unfocused
    fun recordExitFocusChat() {
        AmazonqTelemetry.exitFocusChat(passive = true)
    }

    fun recordStartConversation(tabId: String, data: ChatRequestData) {
        val sessionHistory = sessionStorage.getSession(tabId)?.history ?: return
        if (sessionHistory.size > 1) return
        AmazonqTelemetry.startConversation(
            cwsprChatConversationId = getConversationId(tabId).orEmpty(),
            cwsprChatTriggerInteraction = getTelemetryTriggerType(data.triggerType),
            cwsprChatConversationType = CwsprChatConversationType.Chat,
            cwsprChatUserIntent = data.userIntent?.let { getTelemetryUserIntent(it) },
            cwsprChatHasCodeSnippet = data.activeFileContext.focusAreaContext?.codeSelection?.isNotEmpty() ?: false,
            cwsprChatProgrammingLanguage = data.activeFileContext.fileContext?.fileLanguage,
            credentialStartUrl = getStartUrl(context.project)
        )
    }

    // When Chat API responds to a user message (full response streamed)
    fun recordAddMessage(data: ChatRequestData, response: ChatMessage, responseLength: Int, statusCode: Int) {
        AmazonqTelemetry.addMessage(
            cwsprChatConversationId = getConversationId(response.tabId).orEmpty(),
            cwsprChatMessageId = response.messageId,
            cwsprChatTriggerInteraction = getTelemetryTriggerType(data.triggerType),
            cwsprChatUserIntent = data.userIntent?.let { getTelemetryUserIntent(it) },
            cwsprChatHasCodeSnippet = data.activeFileContext.focusAreaContext?.codeSelection?.isNotEmpty() ?: false,
            cwsprChatProgrammingLanguage = data.activeFileContext.fileContext?.fileLanguage,
            cwsprChatActiveEditorTotalCharacters = data.activeFileContext.focusAreaContext?.codeSelection?.length,
            cwsprChatActiveEditorImportCount = data.activeFileContext.focusAreaContext?.codeNames?.fullyQualifiedNames?.used?.size,
            cwsprChatResponseCodeSnippetCount = 0,
            cwsprChatResponseCode = statusCode,
            cwsprChatSourceLinkCount = response.relatedSuggestions?.size,
            cwsprChatReferencesCount = 0, // TODO
            cwsprChatFollowUpCount = response.followUps?.size,
            cwsprChatTimeToFirstChunk = getResponseStreamTimeToFirstChunk(response.tabId).toInt(),
            cwsprChatTimeBetweenChunks = "[${getResponseStreamTimeBetweenChunks(response.tabId).joinToString(",")}]",
            cwsprChatFullResponseLatency = responseStreamTotalTime[response.tabId] ?: 0,
            cwsprChatRequestLength = data.message.length,
            cwsprChatResponseLength = responseLength,
            cwsprChatConversationType = CwsprChatConversationType.Chat,
            credentialStartUrl = getStartUrl(context.project)
        )

        val programmingLanguage = data.activeFileContext.fileContext?.fileLanguage
        val validProgrammingLanguage = if (ChatSessionV1.validLanguages.contains(programmingLanguage)) programmingLanguage else null

        CodeWhispererClientAdaptor.getInstance(context.project).sendChatAddMessageTelemetry(
            getConversationId(response.tabId).orEmpty(),
            response.messageId,
            CWClientUserIntent.fromValue(data.userIntent?.name),
            (data.activeFileContext.focusAreaContext?.codeSelection?.isNotEmpty() ?: false),
            validProgrammingLanguage,
            data.activeFileContext.focusAreaContext?.codeSelection?.length,
            getResponseStreamTimeToFirstChunk(response.tabId),
            getResponseStreamTimeBetweenChunks(response.tabId),
            (responseStreamTotalTime[response.tabId] ?: 0).toDouble(),
            data.message.length,
            responseLength,
        )
    }

    fun recordMessageResponseError(data: ChatRequestData, tabId: String, responseCode: Int) {
        AmazonqTelemetry.messageResponseError(
            cwsprChatConversationId = getConversationId(tabId).orEmpty(),
            cwsprChatTriggerInteraction = getTelemetryTriggerType(data.triggerType),
            cwsprChatUserIntent = data.userIntent?.let { getTelemetryUserIntent(it) },
            cwsprChatHasCodeSnippet = data.activeFileContext.focusAreaContext?.codeSelection?.isNotEmpty() ?: false,
            cwsprChatProgrammingLanguage = data.activeFileContext.fileContext?.fileLanguage,
            cwsprChatActiveEditorTotalCharacters = data.activeFileContext.focusAreaContext?.codeSelection?.length,
            cwsprChatActiveEditorImportCount = data.activeFileContext.focusAreaContext?.codeNames?.fullyQualifiedNames?.used?.size,
            cwsprChatResponseCode = responseCode,
            cwsprChatRequestLength = data.message.length,
            cwsprChatConversationType = CwsprChatConversationType.Chat,
            credentialStartUrl = getStartUrl(context.project)
        )
    }

    // When user interacts with a message (e.g. copy code, insert code, vote)
    suspend fun recordInteractWithMessage(message: IncomingCwcMessage) {
        val event: ChatInteractWithMessageEvent? = when (message) {
            is IncomingCwcMessage.ChatItemVoted -> {
                AmazonqTelemetry.interactWithMessage(
                    cwsprChatConversationId = getConversationId(message.tabId).orEmpty(),
                    cwsprChatMessageId = message.messageId,
                    cwsprChatInteractionType = when (message.vote) {
                        "upvote" -> CwsprChatInteractionType.Upvote
                        "downvote" -> CwsprChatInteractionType.Downvote
                        else -> CwsprChatInteractionType.Unknown
                    },
                    credentialStartUrl = getStartUrl(context.project)
                )
                ChatInteractWithMessageEvent.builder().apply {
                    conversationId(getConversationId(message.tabId).orEmpty())
                    messageId(message.messageId)
                    interactionType(
                        when (message.vote) {
                            "upvote" -> ChatMessageInteractionType.UPVOTE
                            "downvote" -> ChatMessageInteractionType.DOWNVOTE
                            else -> ChatMessageInteractionType.UNKNOWN_TO_SDK_VERSION
                        }
                    )
                }.build()
            }

            is IncomingCwcMessage.FollowupClicked -> {
                AmazonqTelemetry.interactWithMessage(
                    cwsprChatConversationId = getConversationId(message.tabId).orEmpty(),
                    cwsprChatMessageId = message.messageId.orEmpty(),
                    cwsprChatInteractionType = CwsprChatInteractionType.ClickFollowUp,
                    credentialStartUrl = getStartUrl(context.project)
                )
                ChatInteractWithMessageEvent.builder().apply {
                    conversationId(getConversationId(message.tabId).orEmpty())
                    messageId(message.messageId.orEmpty())
                    interactionType(ChatMessageInteractionType.CLICK_FOLLOW_UP)
                }.build()
            }

            is IncomingCwcMessage.CopyCodeToClipboard -> {
                AmazonqTelemetry.interactWithMessage(
                    cwsprChatConversationId = getConversationId(message.tabId).orEmpty(),
                    cwsprChatMessageId = message.messageId,
                    cwsprChatInteractionType = CwsprChatInteractionType.CopySnippet,
                    cwsprChatAcceptedCharactersLength = message.code.length,
                    cwsprChatInteractionTarget = message.insertionTargetType,
                    cwsprChatHasReference = null,
                    credentialStartUrl = getStartUrl(context.project)
                )
                ChatInteractWithMessageEvent.builder().apply {
                    conversationId(getConversationId(message.tabId).orEmpty())
                    messageId(message.messageId)
                    interactionType(ChatMessageInteractionType.COPY_SNIPPET)
                    interactionTarget(message.insertionTargetType)
                    acceptedCharacterCount(message.code.length)
                }.build()
            }

            is IncomingCwcMessage.InsertCodeAtCursorPosition -> {
                AmazonqTelemetry.interactWithMessage(
                    cwsprChatConversationId = getConversationId(message.tabId).orEmpty(),
                    cwsprChatMessageId = message.messageId,
                    cwsprChatInteractionType = CwsprChatInteractionType.InsertAtCursor,
                    cwsprChatAcceptedCharactersLength = message.code.length,
                    cwsprChatAcceptedNumberOfLines = message.code.lines().size,
                    cwsprChatInteractionTarget = message.insertionTargetType,
                    cwsprChatHasReference = null,
                    credentialStartUrl = getStartUrl(context.project)
                )
                ChatInteractWithMessageEvent.builder().apply {
                    conversationId(getConversationId(message.tabId).orEmpty())
                    messageId(message.messageId)
                    interactionType(ChatMessageInteractionType.INSERT_AT_CURSOR)
                    interactionTarget(message.insertionTargetType)
                    acceptedCharacterCount(message.code.length)
                    acceptedLineCount(message.code.lines().size)
                }.build()
            }

            is IncomingCwcMessage.ClickedLink -> {
                // Null when internal Amazon link is clicked
                if (message.messageId == null) return

                val linkInteractionType = when (message.type) {
                    LinkType.SourceLink -> CwsprChatInteractionType.ClickLink
                    LinkType.BodyLink -> CwsprChatInteractionType.ClickBodyLink
                    else -> CwsprChatInteractionType.Unknown
                }
                AmazonqTelemetry.interactWithMessage(
                    cwsprChatConversationId = getConversationId(message.tabId).orEmpty(),
                    cwsprChatMessageId = message.messageId,
                    cwsprChatInteractionType = linkInteractionType,
                    cwsprChatInteractionTarget = message.link,
                    cwsprChatHasReference = null,
                    credentialStartUrl = getStartUrl(context.project)
                )
                ChatInteractWithMessageEvent.builder().apply {
                    conversationId(getConversationId(message.tabId).orEmpty())
                    messageId(message.messageId)
                    interactionType(
                        when (message.type) {
                            LinkType.SourceLink -> ChatMessageInteractionType.CLICK_LINK
                            LinkType.BodyLink -> ChatMessageInteractionType.CLICK_BODY_LINK
                            else -> ChatMessageInteractionType.UNKNOWN_TO_SDK_VERSION
                        }
                    )
                    interactionTarget(message.link)
                }.build()
            }

            is IncomingCwcMessage.ChatItemFeedback -> {
                recordFeedback(message)
                null
            }

            else -> null
        }

        event?.let { CodeWhispererClientAdaptor.getInstance(context.project).sendChatInteractWithMessageTelemetry(it) }
    }

    private suspend fun recordFeedback(message: IncomingCwcMessage.ChatItemFeedback) {
        val comment = FeedbackComment(
            conversationId = getConversationId(message.tabId).orEmpty(),
            messageId = message.messageId,
            reason = message.selectedOption,
            userComment = message.comment.orEmpty(),
        )

        try {
            TelemetryService.getInstance().sendFeedback(
                sentiment = Sentiment.NEGATIVE,
                comment = ChatController.objectMapper.writeValueAsString(comment),
            )
            logger.info { "CodeWhispererChat answer feedback sent: \"Negative\"" }
            recordFeedbackResult(true)
        } catch (e: Throwable) {
            e.notifyError(message("feedback.submit_failed", e))
            logger.warn(e) { "Failed to submit feedback" }
            recordFeedbackResult(false)
            return
        }
    }

    private fun recordFeedbackResult(success: Boolean) {
        FeedbackTelemetry.result(project = null, success = success)
    }

    // When a conversation(tab) is focused
    fun recordEnterFocusConversation(tabId: String) {
        getConversationId(tabId)?.let {
            AmazonqTelemetry.enterFocusConversation(
                cwsprChatConversationId = it,
            )
        }
    }

    // When a conversation(tab) is unfocused
    fun recordExitFocusConversation(tabId: String) {
        getConversationId(tabId)?.let {
            AmazonqTelemetry.exitFocusConversation(
                cwsprChatConversationId = it,
            )
        }
    }

    fun setResponseStreamStartTime(tabId: String) {
        responseStreamStartTime[tabId] = Instant.now()
        responseStreamTimeForChunks[tabId] = mutableListOf(Instant.now())
    }

    fun setResponseStreamTimeForChunks(tabId: String) {
        val chunkTimes = responseStreamTimeForChunks.getOrPut(tabId) { mutableListOf() }
        chunkTimes += Instant.now()
    }

    fun setResponseStreamTotalTime(tabId: String) {
        val totalTime = Duration.between(responseStreamStartTime[tabId], Instant.now()).toMillis().toInt()
        responseStreamTotalTime[tabId] = totalTime
    }

    private fun getResponseStreamTimeToFirstChunk(tabId: String): Double {
        val chunkTimes = responseStreamTimeForChunks[tabId] ?: return 0.0
        if (chunkTimes.size == 1) return Duration.between(chunkTimes[0], Instant.now()).toMillis().toDouble()
        return Duration.between(chunkTimes[0], chunkTimes[1]).toMillis().toDouble()
    }

    private fun getResponseStreamTimeBetweenChunks(tabId: String): List<Double> = try {
        val chunkDeltaTimes = mutableListOf<Double>()
        val chunkTimes = responseStreamTimeForChunks[tabId] ?: listOf(Instant.now())
        for (idx in 0 until (chunkTimes.size - 1)) {
            chunkDeltaTimes += Duration.between(chunkTimes[idx], chunkTimes[idx + 1]).toMillis().toDouble()
        }
        chunkDeltaTimes.take(100)
    } catch (e: Exception) {
        listOf(-1.0)
    }

    companion object {
        private val logger = getLogger<TelemetryHelper>()

        fun recordOpenChat() {
            AmazonqTelemetry.openChat(passive = true)
        }

        fun recordCloseChat() {
            AmazonqTelemetry.closeChat(passive = true)
        }

        fun recordTelemetryChatRunCommand(type: CwsprChatCommandType, name: String? = null, startUrl: String? = null) {
            AmazonqTelemetry.runCommand(cwsprChatCommandType = type, cwsprChatCommandName = name, credentialStartUrl = startUrl)
        }
    }
}

data class FeedbackComment(
    val conversationId: String,
    val messageId: String,
    val reason: String,
    val userComment: String,
    val type: String = "codewhisperer-chat-answer-feedback",
)
