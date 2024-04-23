// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc.controller.chat.messenger

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.onCompletion
import kotlinx.coroutines.flow.onStart
import software.amazon.awssdk.awscore.exception.AwsServiceException
import software.amazon.awssdk.services.codewhispererstreaming.model.CodeWhispererStreamingException
import software.aws.toolkits.jetbrains.services.cwc.clients.chat.exceptions.ChatApiException
import software.aws.toolkits.jetbrains.services.cwc.clients.chat.model.ChatRequestData
import software.aws.toolkits.jetbrains.services.cwc.clients.chat.model.ChatResponseEvent
import software.aws.toolkits.jetbrains.services.cwc.controller.chat.telemetry.TelemetryHelper
import software.aws.toolkits.jetbrains.services.cwc.messages.ChatMessage
import software.aws.toolkits.jetbrains.services.cwc.messages.ChatMessageType
import software.aws.toolkits.jetbrains.services.cwc.messages.CodeReference
import software.aws.toolkits.jetbrains.services.cwc.messages.FollowUp
import software.aws.toolkits.jetbrains.services.cwc.messages.RecommendationContentSpan
import software.aws.toolkits.jetbrains.services.cwc.messages.Suggestion
import software.aws.toolkits.jetbrains.services.cwc.storage.ChatSessionInfo
import software.aws.toolkits.jetbrains.utils.convertMarkdownToHTML

class ChatPromptHandler(private val telemetryHelper: TelemetryHelper) {

    // The text content sent back to the user is built up over multiple events streamed back from the API
    private val responseText = StringBuilder()
    private val followUps = mutableListOf<FollowUp>()
    private val relatedSuggestions = mutableListOf<Suggestion>()
    private val codeReferences = mutableListOf<CodeReference>()
    private var requestId: String = ""
    private var statusCode: Int = 0

    companion object {
        private val CODE_BLOCK_PATTERN = Regex("<pre>\\s*<code")
    }

    private fun countTotalNumberOfCodeBlocks(message: StringBuilder): Int {
        if (message.isEmpty()) {
            return 0
        }
        val htmlInString = convertMarkdownToHTML(message.toString())
        return CODE_BLOCK_PATTERN.findAll(htmlInString).count()
    }

    fun handle(
        tabId: String,
        triggerId: String,
        data: ChatRequestData,
        sessionInfo: ChatSessionInfo,
    ) = flow {
        val session = sessionInfo.session
        session.chat(data)
            .onStart {
                // The first thing we always send back is an AnswerStream message to indicate the beginning of a streaming answer
                val response =
                    ChatMessage(tabId = tabId, triggerId = triggerId, messageId = requestId, messageType = ChatMessageType.AnswerStream, message = "")

                telemetryHelper.setResponseStreamStartTime(tabId)
                emit(response)
            }
            .onCompletion { error ->
                // Don't emit any other responses if we cancelled the collection
                if (error is CancellationException) {
                    return@onCompletion
                } // for any other exception, let the `catch` operator handle it.
                else if (error != null) {
                    throw error
                }

                // Send the gathered suggestions in a final answer-part message
                if (relatedSuggestions.isNotEmpty()) {
                    val suggestionMessage = ChatMessage(
                        tabId = tabId,
                        triggerId = triggerId,
                        messageId = requestId,
                        messageType = ChatMessageType.AnswerPart,
                        message = responseText.toString(),
                        relatedSuggestions = relatedSuggestions,
                    )
                    emit(suggestionMessage)
                }

                // Send the Answer message to indicate the end of the response stream
                val response =
                    ChatMessage(tabId = tabId, triggerId = triggerId, messageId = requestId, messageType = ChatMessageType.Answer, followUps = followUps)

                telemetryHelper.setResponseStreamTotalTime(tabId)
                telemetryHelper.recordAddMessage(data, response, responseText.length, statusCode, countTotalNumberOfCodeBlocks(responseText))
                emit(response)
            }
            .catch { exception ->
                val statusCode = if (exception is AwsServiceException) exception.statusCode() else 0
                telemetryHelper.recordMessageResponseError(data, tabId, statusCode)
                if (exception is CodeWhispererStreamingException) {
                    throw ChatApiException(
                        message = exception.message ?: "Encountered exception calling the API",
                        sessionId = session.conversationId,
                        requestId = exception.requestId(),
                        statusCode = exception.statusCode(),
                        cause = exception,
                    )
                } else {
                    throw ChatApiException(
                        message = exception.message ?: "Encountered exception calling the API",
                        sessionId = session.conversationId,
                        requestId = null,
                        statusCode = null,
                        cause = exception,
                    )
                }
            }
            .collect { responseEvent ->
                processChatEvent(tabId, triggerId, responseEvent)?.let { emit(it) }
            }
    }

    private fun processChatEvent(tabId: String, triggerId: String, event: ChatResponseEvent): ChatMessage? {
        requestId = event.requestId
        statusCode = event.statusCode

        if (event.codeReferences != null) {
            codeReferences += event.codeReferences.map { reference ->
                CodeReference(
                    licenseName = reference.licenseName,
                    repository = reference.repository,
                    url = reference.url,
                    recommendationContentSpan = RecommendationContentSpan(
                        reference.recommendationContentSpan?.start ?: 0,
                        reference.recommendationContentSpan?.end ?: 0,
                    ),
                    information = "Reference code under **${reference.licenseName}** license from repository `${reference.repository}`",
                )
            }
        }

        if (event.suggestions != null) {
            var index = 0
            relatedSuggestions += event.suggestions.map { apiSuggestion ->
                Suggestion(
                    title = apiSuggestion.title,
                    url = apiSuggestion.url,
                    body = apiSuggestion.body,
                    id = index++,
                    type = apiSuggestion.type,
                    context = apiSuggestion.context,
                )
            }
        }

        if (event.followUps != null) {
            event.followUps.forEach { item ->
                item.pillText?.let {
                    followUps += FollowUp(
                        type = item.type,
                        pillText = item.pillText,
                        prompt = item.prompt ?: item.pillText,
                    )
                }
                item.message?.let {
                    followUps += FollowUp(
                        type = item.type,
                        pillText = item.message,
                        prompt = item.message,
                    )
                }
            }
        }

        return if (event.token != null) {
            responseText.append(event.token)
            telemetryHelper.setResponseStreamTimeForChunks(tabId)
            ChatMessage(
                tabId = tabId,
                triggerId = triggerId,
                messageId = event.requestId,
                messageType = ChatMessageType.AnswerPart,
                message = responseText.toString(),
                codeReference = codeReferences,
            )
        } else {
            null
        }
    }
}
