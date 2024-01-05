// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc.clients.chat.v1

import com.intellij.openapi.project.Project
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.future.await
import kotlinx.coroutines.withTimeout
import software.amazon.awssdk.services.codewhispererstreaming.CodeWhispererStreamingAsyncClient
import software.amazon.awssdk.services.codewhispererstreaming.model.AssistantResponseEvent
import software.amazon.awssdk.services.codewhispererstreaming.model.ChatMessage
import software.amazon.awssdk.services.codewhispererstreaming.model.ChatResponseStream
import software.amazon.awssdk.services.codewhispererstreaming.model.ChatTriggerType
import software.amazon.awssdk.services.codewhispererstreaming.model.CodeReferenceEvent
import software.amazon.awssdk.services.codewhispererstreaming.model.ConversationState
import software.amazon.awssdk.services.codewhispererstreaming.model.CursorState
import software.amazon.awssdk.services.codewhispererstreaming.model.DocumentSymbol
import software.amazon.awssdk.services.codewhispererstreaming.model.EditorState
import software.amazon.awssdk.services.codewhispererstreaming.model.FollowupPromptEvent
import software.amazon.awssdk.services.codewhispererstreaming.model.GenerateAssistantResponseRequest
import software.amazon.awssdk.services.codewhispererstreaming.model.GenerateAssistantResponseResponseHandler
import software.amazon.awssdk.services.codewhispererstreaming.model.Position
import software.amazon.awssdk.services.codewhispererstreaming.model.ProgrammingLanguage
import software.amazon.awssdk.services.codewhispererstreaming.model.Range
import software.amazon.awssdk.services.codewhispererstreaming.model.SupplementaryWebLinksEvent
import software.amazon.awssdk.services.codewhispererstreaming.model.SymbolType
import software.amazon.awssdk.services.codewhispererstreaming.model.TextDocument
import software.amazon.awssdk.services.codewhispererstreaming.model.UserInputMessage
import software.amazon.awssdk.services.codewhispererstreaming.model.UserInputMessageContext
import software.amazon.awssdk.services.codewhispererstreaming.model.UserIntent
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.core.utils.info
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.coroutines.getCoroutineBgContext
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.pinning.QConnection
import software.aws.toolkits.jetbrains.services.cwc.ChatConstants
import software.aws.toolkits.jetbrains.services.cwc.clients.chat.ChatSession
import software.aws.toolkits.jetbrains.services.cwc.clients.chat.exceptions.ChatApiException
import software.aws.toolkits.jetbrains.services.cwc.clients.chat.model.ChatRequestData
import software.aws.toolkits.jetbrains.services.cwc.clients.chat.model.ChatResponseEvent
import software.aws.toolkits.jetbrains.services.cwc.clients.chat.model.FollowUpType
import software.aws.toolkits.jetbrains.services.cwc.clients.chat.model.RecommendationContentSpan
import software.aws.toolkits.jetbrains.services.cwc.clients.chat.model.Reference
import software.aws.toolkits.jetbrains.services.cwc.clients.chat.model.SuggestedFollowUp
import software.aws.toolkits.jetbrains.services.cwc.clients.chat.model.Suggestion
import software.aws.toolkits.jetbrains.services.cwc.editor.context.ActiveFileContext

class ChatSessionV1(
    private val project: Project,
) : ChatSession {

    override var conversationId: String? = null

    override fun chat(data: ChatRequestData): Flow<ChatResponseEvent> = callbackFlow {
        var requestId: String = ""
        var statusCode: Int = 0

        val responseHandler = GenerateAssistantResponseResponseHandler.builder()
            .onResponse {
                requestId = it.responseMetadata().requestId()
                statusCode = it.sdkHttpResponse().statusCode()
                conversationId = it.conversationId()

                logger.info {
                    val metadata = it.responseMetadata()
                    "Response to tab: ${data.tabId}, conversationId: $conversationId, requestId: ${metadata.requestId()}, metadata: $metadata"
                }
            }
            .subscriber { stream: ChatResponseStream ->
                stream.accept(object : GenerateAssistantResponseResponseHandler.Visitor {

                    override fun visitAssistantResponseEvent(event: AssistantResponseEvent) {
                        trySend(
                            ChatResponseEvent(
                                requestId = requestId,
                                statusCode = statusCode,
                                token = event.content(),
                                followUps = null,
                                suggestions = null,
                                query = null,
                                codeReferences = null,
                            ),
                        )
                    }

                    override fun visitSupplementaryWebLinksEvent(event: SupplementaryWebLinksEvent) {
                        val suggestions = event.supplementaryWebLinks().map { link ->
                            Suggestion(
                                url = link.url(),
                                title = link.title(),
                                body = link.snippet(),
                                context = emptyList(),
                                metadata = null,
                                type = null,
                            )
                        }
                        trySend(
                            ChatResponseEvent(
                                requestId = requestId,
                                statusCode = statusCode,
                                token = null,
                                followUps = null,
                                suggestions = suggestions,
                                query = null,
                                codeReferences = null,
                            ),
                        )
                    }

                    override fun visitFollowupPromptEvent(event: FollowupPromptEvent) {
                        val followUp = event.followupPrompt()
                        trySend(
                            ChatResponseEvent(
                                requestId = requestId,
                                statusCode = statusCode,
                                token = null,
                                followUps = listOf(
                                    SuggestedFollowUp(
                                        type = followUp.userIntent().toFollowUpType(),
                                        pillText = followUp.content(),
                                        prompt = followUp.content(),
                                        message = null,
                                        attachedSuggestions = null,
                                    ),
                                ),
                                suggestions = null,
                                query = null,
                                codeReferences = null,
                            ),
                        )
                    }

                    override fun visitCodeReferenceEvent(event: CodeReferenceEvent) {
                        val references = event.references().map { reference ->
                            Reference(
                                licenseName = reference.licenseName(),
                                url = reference.url(),
                                repository = reference.repository(),
                                recommendationContentSpan = reference.recommendationContentSpan()?.let { span ->
                                    RecommendationContentSpan(
                                        start = span.start(),
                                        end = span.end(),
                                    )
                                },
                            )
                        }
                        trySend(
                            ChatResponseEvent(
                                requestId = requestId,
                                statusCode = statusCode,
                                token = null,
                                followUps = null,
                                suggestions = null,
                                query = null,
                                codeReferences = references,
                            ),
                        )
                    }
                })
            }
            .build()

        try {
            withTimeout(ChatConstants.REQUEST_TIMEOUT_MS.toLong()) {
                val connection = ToolkitConnectionManager.getInstance(project).activeConnectionForFeature(QConnection.getInstance())
                    // this should never happen because it should have been handled upstream by [AuthController]
                    ?: error("connection was found to be null")

                val client = AwsClientManager.getInstance().getClient<CodeWhispererStreamingAsyncClient>(connection.getConnectionSettings())
                val request = data.toChatRequest()
                logger.info { "Request from tab: ${data.tabId}, conversationId: $conversationId, request: $request" }
                client.generateAssistantResponse(request, responseHandler).await()
            }
        } catch (e: TimeoutCancellationException) {
            // Re-throw an exception that can be caught downstream
            throw ChatApiException(
                message = "API request timed out",
                sessionId = conversationId,
            )
        } finally {
            channel.close()
        }

        awaitClose {
            // nothing to do here
        }
    }.flowOn(getCoroutineBgContext())

    /**
     * Turns the request data into the request structure used by the client
     */
    private fun ChatRequestData.toChatRequest(): GenerateAssistantResponseRequest {
        val userInputMessageContextBuilder = UserInputMessageContext.builder()
        if (activeFileContext.fileContext != null) {
            userInputMessageContextBuilder.editorState(activeFileContext.toEditorState())
        }
        val userInputMessageContext = userInputMessageContextBuilder.build()

        val userInput = UserInputMessage.builder()
            .content(message.take(ChatConstants.CUSTOMER_MESSAGE_SIZE_LIMIT))
            .userIntent(userIntent)
            .userInputMessageContext(userInputMessageContext)
            .build()
        val conversationState = ConversationState.builder()
            .conversationId(conversationId)
            .currentMessage(ChatMessage.fromUserInputMessage(userInput))
            .chatTriggerType(ChatTriggerType.MANUAL)
            .build()
        return GenerateAssistantResponseRequest.builder()
            .conversationState(conversationState)
            .build()
    }

    private fun ActiveFileContext.toEditorState(): EditorState {
        // Cursor State
        val start = focusAreaContext?.codeSelectionRange?.start
        val end = focusAreaContext?.codeSelectionRange?.end

        val cursorStateBuilder = CursorState.builder()

        if (start != null && end != null) {
            cursorStateBuilder.range(
                Range.builder()
                    .start(
                        Position.builder()
                            .line(start.row)
                            .character(start.column)
                            .build(),
                    )
                    .end(
                        Position.builder()
                            .line(end.row)
                            .character(end.column)
                            .build(),
                    ).build(),
            )
        }

        // Code Names -> DocumentSymbols
        val codeNames = focusAreaContext?.codeNames
        val documentBuilder = TextDocument.builder()

        val documentSymbolList = codeNames?.fullyQualifiedNames?.used?.map {
            DocumentSymbol.builder()
                .name(it.symbol?.joinToString(separator = "."))
                .type(SymbolType.USAGE)
                .source(it.source?.joinToString(separator = "."))
                .build()
        }?.filter { it.name().length in ChatConstants.FQN_SIZE_MIN until ChatConstants.FQN_SIZE_LIMIT }.orEmpty()
        documentBuilder.documentSymbols(documentSymbolList)

        // File Text
        val trimmedFileText = focusAreaContext?.trimmedSurroundingFileText
        documentBuilder.text(trimmedFileText)

        // Programming Language
        val programmingLanguage = fileContext?.fileLanguage
        if (programmingLanguage != null && validLanguages.contains(programmingLanguage)) {
            documentBuilder.programmingLanguage(
                ProgrammingLanguage.builder()
                    .languageName(programmingLanguage).build(),
            )
        }

        // Relative File Path
        val filePath = fileContext?.filePath
        if (filePath != null) {
            documentBuilder.relativeFilePath(filePath.take(ChatConstants.FILE_PATH_SIZE_LIMIT))
        }

        return EditorState.builder()
            .cursorState(cursorStateBuilder.build())
            .document(documentBuilder.build())
            .build()
    }

    private fun UserIntent?.toFollowUpType() = when (this) {
        UserIntent.SUGGEST_ALTERNATE_IMPLEMENTATION -> FollowUpType.Alternatives
        UserIntent.APPLY_COMMON_BEST_PRACTICES -> FollowUpType.CommonPractices
        UserIntent.IMPROVE_CODE -> FollowUpType.Improvements
        UserIntent.SHOW_EXAMPLES -> FollowUpType.MoreExamples
        UserIntent.CITE_SOURCES -> FollowUpType.CiteSources
        UserIntent.EXPLAIN_LINE_BY_LINE -> FollowUpType.LineByLine
        UserIntent.EXPLAIN_CODE_SELECTION -> FollowUpType.ExplainInDetail
        UserIntent.UNKNOWN_TO_SDK_VERSION -> FollowUpType.Generated
        null -> FollowUpType.Generated
    }

    companion object {
        private val logger = getLogger<ChatSessionV1>()

        val validLanguages = arrayOf(
            "python",
            "javascript",
            "java",
            "csharp",
            "typescript",
            "c",
            "cpp",
            "go",
            "kotlin",
            "php",
            "ruby",
            "rust",
            "scala",
            "shell",
            "sql",
            "json",
            "yaml",
            "vue",
            "tf",
        )
    }
}
