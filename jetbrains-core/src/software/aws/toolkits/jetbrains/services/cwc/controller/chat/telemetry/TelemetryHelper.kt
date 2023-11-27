// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc.controller.chat.telemetry

import software.amazon.awssdk.services.codewhispererstreaming.model.UserIntent
import software.amazon.awssdk.services.toolkittelemetry.model.Sentiment
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.core.utils.warn
import software.aws.toolkits.jetbrains.services.amazonq.apps.AmazonQAppInitContext
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererClientAdaptor
import software.aws.toolkits.jetbrains.services.cwc.clients.chat.model.ChatRequestData
import software.aws.toolkits.jetbrains.services.cwc.clients.chat.model.TriggerType
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
        AmazonqTelemetry.enterFocusChat()
    }

    // When chat panel is unfocused
    fun recordExitFocusChat() {
        AmazonqTelemetry.exitFocusChat()
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
            cwsprChatTimeToFirstChunk = getResponseStreamTimeToFirstChunk(response.tabId),
            cwsprChatTimeBetweenChunks = "", // getResponseStreamTimeBetweenChunks(response.tabId), //TODO: allow '[', ']' and ',' chars
            cwsprChatFullResponseLatency = responseStreamTotalTime[response.tabId] ?: 0,
            cwsprChatRequestLength = data.message.length,
            cwsprChatResponseLength = responseLength,
            cwsprChatConversationType = CwsprChatConversationType.Chat,
        )

        val metadata: Map<String, Any?> = mapOf(
            "cwsprChatConversationId" to getConversationId(response.tabId).orEmpty(),
            "cwsprChatMessageId" to response.messageId,
            "cwsprChatTriggerInteraction" to getTelemetryTriggerType(data.triggerType),
            "cwsprChatUserIntent" to data.userIntent?.let { getTelemetryUserIntent(it) },
            "cwsprChatHasCodeSnippet" to (data.activeFileContext.focusAreaContext?.codeSelection?.isNotEmpty() ?: false),
            "cwsprChatProgrammingLanguage" to data.activeFileContext.fileContext?.fileLanguage,
            "cwsprChatActiveEditorTotalCharacters" to data.activeFileContext.focusAreaContext?.codeSelection?.length,
            "cwsprChatActiveEditorImportCount" to data.activeFileContext.focusAreaContext?.codeNames?.fullyQualifiedNames?.used?.size,
            "cwsprChatResponseCodeSnippetCount" to 0,
            "cwsprChatResponseCode" to statusCode,
            "cwsprChatSourceLinkCount" to response.relatedSuggestions?.size,
            "cwsprChatReferencesCount" to 0, // TODO
            "cwsprChatFollowUpCount" to response.followUps?.size,
            "cwsprChatTimeToFirstChunk" to getResponseStreamTimeToFirstChunk(response.tabId),
            "cwsprChatTimeBetweenChunks" to "", // getResponseStreamTimeBetweenChunks(response.tabId), //TODO: allow '[', ']' and ',' chars
            "cwsprChatFullResponseLatency" to (responseStreamTotalTime[response.tabId] ?: 0),
            "cwsprChatRequestLength" to data.message.length,
            "cwsprChatResponseLength" to responseLength,
            "cwsprChatConversationType" to CwsprChatConversationType.Chat
        )
        sendMetricData("amazonq_addMessage", metadata)
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
        )
    }

    // When user interacts with a message (e.g. copy code, insert code, vote)
    suspend fun recordInteractWithMessage(message: IncomingCwcMessage) {
        val metadata: Map<String, Any?> = when (message) {
            is IncomingCwcMessage.ChatItemVoted -> {
                AmazonqTelemetry.interactWithMessage(
                    cwsprChatConversationId = getConversationId(message.tabId).orEmpty(),
                    cwsprChatMessageId = message.messageId,
                    cwsprChatInteractionType = when (message.vote) {
                        "upvote" -> CwsprChatInteractionType.Upvote
                        "downvote" -> CwsprChatInteractionType.Downvote
                        else -> CwsprChatInteractionType.Unknown
                    },
                )
                mapOf(
                    "cwsprChatConversationId" to getConversationId(message.tabId).orEmpty(),
                    "cwsprChatMessageId" to message.messageId,
                    "cwsprChatInteractionType" to when (message.vote) {
                        "upvote" -> CwsprChatInteractionType.Upvote
                        "downvote" -> CwsprChatInteractionType.Downvote
                        else -> CwsprChatInteractionType.Unknown
                    }
                )
            }

            is IncomingCwcMessage.FollowupClicked -> {
                AmazonqTelemetry.interactWithMessage(
                    cwsprChatConversationId = getConversationId(message.tabId).orEmpty(),
                    cwsprChatMessageId = message.messageId.orEmpty(),
                    cwsprChatInteractionType = CwsprChatInteractionType.ClickFollowUp,
                )
                mapOf(
                    "cwsprChatConversationId" to getConversationId(message.tabId).orEmpty(),
                    "cwsprChatMessageId" to message.messageId.orEmpty(),
                    "cwsprChatInteractionType" to CwsprChatInteractionType.ClickFollowUp,
                )
            }

            is IncomingCwcMessage.CopyCodeToClipboard -> {
                AmazonqTelemetry.interactWithMessage(
                    cwsprChatConversationId = getConversationId(message.tabId).orEmpty(),
                    cwsprChatMessageId = message.messageId,
                    cwsprChatInteractionType = CwsprChatInteractionType.CopySnippet,
                    cwsprChatAcceptedCharactersLength = message.code.length,
                    cwsprChatInteractionTarget = message.insertionTargetType,
                    cwsprChatHasReference = null,
                )
                mapOf(
                    "cwsprChatConversationId" to getConversationId(message.tabId).orEmpty(),
                    "cwsprChatMessageId" to message.messageId,
                    "cwsprChatInteractionType" to CwsprChatInteractionType.CopySnippet,
                    "cwsprChatAcceptedCharactersLength" to message.code.length,
                    "cwsprChatInteractionTarget" to message.insertionTargetType,
                    "cwsprChatHasReference" to null,
                )
            }

            is IncomingCwcMessage.InsertCodeAtCursorPosition -> {
                AmazonqTelemetry.interactWithMessage(
                    cwsprChatConversationId = getConversationId(message.tabId).orEmpty(),
                    cwsprChatMessageId = message.messageId,
                    cwsprChatInteractionType = CwsprChatInteractionType.InsertAtCursor,
                    cwsprChatAcceptedCharactersLength = message.code.length,
                    cwsprChatInteractionTarget = message.insertionTargetType,
                    cwsprChatHasReference = null,
                )
                mapOf(
                    "cwsprChatConversationId" to getConversationId(message.tabId).orEmpty(),
                    "cwsprChatMessageId" to message.messageId,
                    "cwsprChatInteractionType" to CwsprChatInteractionType.InsertAtCursor,
                    "cwsprChatAcceptedCharactersLength" to message.code.length,
                    "cwsprChatInteractionTarget" to message.insertionTargetType,
                    "cwsprChatHasReference" to null,
                )
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
                )
                mapOf(
                    "cwsprChatConversationId" to getConversationId(message.tabId).orEmpty(),
                    "cwsprChatMessageId" to message.messageId,
                    "cwsprChatInteractionType" to linkInteractionType,
                    "cwsprChatInteractionTarget" to message.link,
                    "cwsprChatHasReference" to null,
                )
            }

            is IncomingCwcMessage.ChatItemFeedback -> {
                recordFeedback(message)
                emptyMap()
            }

            else -> emptyMap()
        }

        sendMetricData("amazonq_interactWithMessage", metadata)
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

    private fun getResponseStreamTimeToFirstChunk(tabId: String): Int {
        val chunkTimes = responseStreamTimeForChunks[tabId] ?: return 0
        if (chunkTimes.size == 1) return Duration.between(chunkTimes[0], Instant.now()).toMillis().toInt()
        return Duration.between(chunkTimes[0], chunkTimes[1]).toMillis().toInt()
    }

//    private fun getResponseStreamTimeBetweenChunks(tabId: String): String = try {
//        val chunkDeltaTimes = mutableListOf<Int>()
//        val chunkTimes = responseStreamTimeForChunks[tabId] ?: listOf(Instant.now())
//        for (idx in 0 until (chunkTimes.size - 1)) {
//            chunkDeltaTimes += Duration.between(chunkTimes[idx], chunkTimes[idx + 1]).toMillis().toInt()
//        }
//
//        val joined = "[" + chunkDeltaTimes.joinToString(",").take(2000)
//        val fixed = if (joined.last() == ',') "${joined}0" else joined
//        if (fixed.last() == ']') fixed else "$fixed]"
//    } catch (e: Exception) {
//        "[-1]"
//    }

    private fun sendMetricData(eventName: String, metadata: Map<String, Any?>) {
        try {
            CodeWhispererClientAdaptor.getInstance(context.project).sendMetricDataTelemetry(eventName, metadata)
        } catch (e: Throwable) {
            logger.warn(e) { "Failed to send metric data" }
        }
    }

    companion object {
        private val logger = getLogger<TelemetryHelper>()

        fun recordOpenChat() {
            AmazonqTelemetry.openChat()
        }

        fun recordCloseChat() {
            AmazonqTelemetry.closeChat()
        }

        fun recordTelemetryChatRunCommand(type: CwsprChatCommandType, name: String? = null) {
            AmazonqTelemetry.runCommand(cwsprChatCommandType = type, cwsprChatCommandName = name)
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
