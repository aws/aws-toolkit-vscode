// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq

import com.intellij.openapi.Disposable
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.project.Project
import com.intellij.testFramework.ProjectExtension
import com.intellij.testFramework.junit5.TestDisposable
import com.intellij.testFramework.registerServiceInstance
import com.intellij.testFramework.replaceService
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.RegisterExtension
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.stub
import org.mockito.kotlin.verify
import software.amazon.awssdk.awscore.DefaultAwsResponseMetadata
import software.amazon.awssdk.awscore.util.AwsHeader.AWS_REQUEST_ID
import software.amazon.awssdk.http.SdkHttpResponse
import software.amazon.awssdk.services.codewhispererruntime.model.ChatInteractWithMessageEvent
import software.amazon.awssdk.services.codewhispererruntime.model.ChatMessageInteractionType
import software.amazon.awssdk.services.codewhispererruntime.model.SendTelemetryEventResponse
import software.amazon.awssdk.services.codewhispererstreaming.model.UserIntent
import software.amazon.awssdk.services.ssooidc.SsoOidcClient
import software.aws.toolkits.core.telemetry.MetricEvent
import software.aws.toolkits.core.telemetry.TelemetryBatcher
import software.aws.toolkits.jetbrains.core.MockClientManagerExtension
import software.aws.toolkits.jetbrains.core.credentials.LegacyManagedBearerSsoConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.pinning.QConnection
import software.aws.toolkits.jetbrains.core.credentials.sono.Q_SCOPES
import software.aws.toolkits.jetbrains.services.amazonq.apps.AmazonQAppInitContext
import software.aws.toolkits.jetbrains.services.codewhisperer.credentials.CodeWhispererClientAdaptor
import software.aws.toolkits.jetbrains.services.codewhisperer.customization.CodeWhispererCustomization
import software.aws.toolkits.jetbrains.services.codewhisperer.customization.CodeWhispererModelConfigurator
import software.aws.toolkits.jetbrains.services.codewhisperer.settings.CodeWhispererSettings
import software.aws.toolkits.jetbrains.services.cwc.clients.chat.ChatSession
import software.aws.toolkits.jetbrains.services.cwc.clients.chat.model.ChatRequestData
import software.aws.toolkits.jetbrains.services.cwc.clients.chat.model.CodeNamesImpl
import software.aws.toolkits.jetbrains.services.cwc.clients.chat.model.FullyQualifiedName
import software.aws.toolkits.jetbrains.services.cwc.clients.chat.model.FullyQualifiedNames
import software.aws.toolkits.jetbrains.services.cwc.clients.chat.model.TriggerType
import software.aws.toolkits.jetbrains.services.cwc.controller.chat.telemetry.TelemetryHelper
import software.aws.toolkits.jetbrains.services.cwc.editor.context.ActiveFileContext
import software.aws.toolkits.jetbrains.services.cwc.editor.context.file.FileContext
import software.aws.toolkits.jetbrains.services.cwc.editor.context.focusArea.FocusAreaContext
import software.aws.toolkits.jetbrains.services.cwc.editor.context.focusArea.UICodeSelectionLineRange
import software.aws.toolkits.jetbrains.services.cwc.editor.context.focusArea.UICodeSelectionRange
import software.aws.toolkits.jetbrains.services.cwc.messages.ChatMessage
import software.aws.toolkits.jetbrains.services.cwc.messages.ChatMessageType
import software.aws.toolkits.jetbrains.services.cwc.messages.IncomingCwcMessage
import software.aws.toolkits.jetbrains.services.cwc.messages.LinkType
import software.aws.toolkits.jetbrains.services.cwc.storage.ChatSessionInfo
import software.aws.toolkits.jetbrains.services.cwc.storage.ChatSessionStorage
import software.aws.toolkits.jetbrains.services.telemetry.MockTelemetryServiceExtension
import software.aws.toolkits.telemetry.CwsprChatConversationType
import software.aws.toolkits.telemetry.CwsprChatInteractionType
import software.aws.toolkits.telemetry.CwsprChatTriggerInteraction
import software.aws.toolkits.telemetry.CwsprChatUserIntent
import kotlin.test.assertNotNull

class TelemetryHelperTest {
    // sut
    private lateinit var sut: TelemetryHelper

    private lateinit var appInitContext: AmazonQAppInitContext
    private lateinit var sessionStorage: ChatSessionStorage

    // dependencies
    private lateinit var mockBatcher: TelemetryBatcher
    private lateinit var mockClient: CodeWhispererClientAdaptor
    private lateinit var mockConnectionManager: ToolkitConnectionManager
    private lateinit var mockModelConfigurator: CodeWhispererModelConfigurator

    private lateinit var mockConnection: ToolkitConnection
    private val project: Project
        get() = projectExtension.project

    @JvmField
    @RegisterExtension
    val mockClientManager = MockClientManagerExtension()

    @JvmField
    @RegisterExtension
    val mockTelemetryService = MockTelemetryServiceExtension()

    @TestDisposable
    private lateinit var disposable: Disposable

    companion object {
        @JvmField
        @RegisterExtension
        val projectExtension = ProjectExtension()

        private const val mockUrl = "mockUrl"
        private const val mockRegion = "us-east-1"
        private const val tabId = "tabId"
        private const val messageId = "messageId"
        private const val conversationId = "conversationId"
        private const val triggerId = "triggerId"
        private const val customizationArn = "customizationArn"
        private const val steRequestId = "sendTelemetryEventRequestId"
        private const val lang = "java"
        private val mockCustomization = CodeWhispererCustomization(customizationArn, "name", "description")
        private val data = ChatRequestData(
            tabId = tabId,
            message = "foo",
            activeFileContext = ActiveFileContext(
                FileContext(lang, "~/foo/bar/baz", null),
                FocusAreaContext(
                    codeSelection = "",
                    codeSelectionRange = UICodeSelectionRange(
                        UICodeSelectionLineRange(1, 2),
                        UICodeSelectionLineRange(3, 4)
                    ),
                    trimmedSurroundingFileText = "",
                    codeNames = CodeNamesImpl(
                        listOf("simpleName_1"),
                        FullyQualifiedNames(
                            listOf(
                                FullyQualifiedName(
                                    listOf("source_1"),
                                    listOf("symbol_1")
                                )
                            )
                        )
                    )
                )
            ),
            userIntent = UserIntent.IMPROVE_CODE,
            triggerType = TriggerType.Hotkeys,
            customization = mockCustomization,
            relevantTextDocuments = emptyList(),
            useRelevantDocuments = true,
        )
        private val response = ChatMessage(
            tabId = tabId,
            triggerId = triggerId,
            messageType = ChatMessageType.Prompt,
            messageId = messageId,
            followUps = listOf(mock(), mock())
        )
        private val mockSteResponse = SendTelemetryEventResponse.builder()
            .apply {
                this.sdkHttpResponse(
                    SdkHttpResponse.builder().build()
                )
                this.responseMetadata(
                    DefaultAwsResponseMetadata.create(
                        mapOf(AWS_REQUEST_ID to steRequestId)
                    )
                )
            }.build()
    }

    @BeforeEach
    fun setup() {
        // set up sut
        appInitContext = AmazonQAppInitContext(
            project = project,
            messagesFromAppToUi = mock(),
            messagesFromUiToApp = mock(),
            messageTypeRegistry = mock(),
            fqnWebviewAdapter = mock()
        )
        val mockSession = mock<ChatSession> {
            on { this.conversationId } doReturn conversationId
        }
        sessionStorage = mock {
            on { this.getSession(eq(tabId)) } doReturn ChatSessionInfo(session = mockSession, scope = mock(), history = mutableListOf())
        }
        sut = TelemetryHelper(appInitContext, sessionStorage)

        // set up client
        mockClientManager.create<SsoOidcClient>()

        // set up connection
        mockConnection = LegacyManagedBearerSsoConnection(
            mockUrl,
            mockRegion,
            Q_SCOPES,
            mock()
        )
        mockConnectionManager = mock {
            on { activeConnectionForFeature(eq(QConnection.getInstance())) } doReturn mockConnection
        }
        project.replaceService(ToolkitConnectionManager::class.java, mockConnectionManager, disposable)

        // set up telemetry service
        mockBatcher = mockTelemetryService.batcher()

        // set up client
        mockClient = mock()
        // TODO: use registerService instead of replace service because it's codewhisperer package, and replaceService will fail in 232
        project.registerServiceInstance(CodeWhispererClientAdaptor::class.java, mockClient)

        // set up customization
        mockModelConfigurator = mock {
            on { activeCustomization(project) } doReturn mockCustomization
        }
        // TODO: use registerService instead of replace service because it's codewhisperer package, and replaceService will fail in 232
        ApplicationManager.getApplication().registerServiceInstance(CodeWhispererModelConfigurator::class.java, mockModelConfigurator)
    }

    @Test
    fun recordAddMessageTest() {
        mockClient.stub {
            on {
                sendChatAddMessageTelemetry(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any())
            } doReturn mockSteResponse
        }

        // set up request data
        val responseLength = 10
        val statusCode = 400
        val numberOfCodeBlocks = 1

        sut.recordAddMessage(
            data = data,
            response = response,
            responseLength = responseLength,
            statusCode = statusCode,
            numberOfCodeBlocks = numberOfCodeBlocks
        )

        // Q STE
        verify(mockClient).sendChatAddMessageTelemetry(
            sessionId = eq(conversationId),
            requestId = eq(messageId),
            userIntent = eq(software.amazon.awssdk.services.codewhispererruntime.model.UserIntent.fromValue(data.userIntent?.name)),
            hasCodeSnippet = any(),
            programmingLanguage = eq(lang),
            activeEditorTotalCharacters = eq(data.activeFileContext.focusAreaContext?.codeSelection?.length),
            timeToFirstChunkMilliseconds = eq(sut.getResponseStreamTimeToFirstChunk(tabId)),
            timeBetweenChunks = eq(sut.getResponseStreamTimeBetweenChunks(tabId)),
            fullResponselatency = any(), // TODO
            requestLength = eq(data.message.length),
            responseLength = eq(responseLength),
            numberOfCodeBlocks = eq(numberOfCodeBlocks),
            hasProjectLevelContext = eq(CodeWhispererSettings.getInstance().isProjectContextEnabled()),
            customization = eq(mockCustomization)
        )

        // Toolkit telemetry
        argumentCaptor<MetricEvent> {
            verify(mockBatcher).enqueue(capture())
            val event = firstValue.data.find { it.name == "amazonq_addMessage" }
            assertNotNull(event)
            assertThat(event)
                .matches({ it.metadata["cwsprChatConversationId"] == conversationId }, "conversation id doesn't match")
                .matches({ it.metadata["cwsprChatMessageId"] == "messageId" }, "message id doesn't match")
                .matches(
                    { it.metadata["cwsprChatTriggerInteraction"] == CwsprChatTriggerInteraction.ContextMenu.toString() },
                    "trigger type doesn't match"
                )
                .matches({ it.metadata["cwsprChatUserIntent"] == CwsprChatUserIntent.ImproveCode.toString() }, "user intent doesn't match")
                .matches({
                    it.metadata["cwsprChatHasCodeSnippet"] == (
                        data.activeFileContext.focusAreaContext?.codeSelection?.isNotEmpty()
                            ?: false
                        ).toString()
                }, "has code snippet doesn't match")
                .matches({ it.metadata["cwsprChatProgrammingLanguage"] == "java" }, "language doesn't match")
                .matches(
                    { it.metadata["cwsprChatActiveEditorTotalCharacters"] == data.activeFileContext.focusAreaContext?.codeSelection?.length?.toString() },
                    "total characters doesn't match"
                )
                .matches(
                    {
                        it.metadata["cwsprChatActiveEditorImportCount"] ==
                            data.activeFileContext.focusAreaContext?.codeNames?.fullyQualifiedNames?.used?.size?.toString()
                    },
                    "import count doesn't match"
                )
                .matches(
                    { it.metadata["cwsprChatResponseCodeSnippetCount"] == numberOfCodeBlocks.toString() },
                    "number of code blocks doesn't match"
                )
                .matches({ it.metadata["cwsprChatResponseCode"] == statusCode.toString() }, "response code doesn't match")
                .matches(
                    { it.metadata["cwsprChatSourceLinkCount"] == response.relatedSuggestions?.size?.toString() },
                    "source link count doesn't match"
                )
                .matches({ it.metadata["cwsprChatFollowUpCount"] == response.followUps?.size?.toString() }, "follow up count doesn't match")
                .matches(
                    { it.metadata["cwsprChatTimeToFirstChunk"] == sut.getResponseStreamTimeToFirstChunk(response.tabId).toInt().toString() },
                    "time to first chunk doesn't match"
                )
                .matches({
                    it.metadata["cwsprChatTimeBetweenChunks"] == "[${
                        sut.getResponseStreamTimeBetweenChunks(response.tabId).joinToString(", ")
                    }]"
                }, "time between chunks doesn't match")
                .matches({ it.metadata["cwsprChatRequestLength"] == data.message.length.toString() }, "request length doesn't match")
                .matches({ it.metadata["cwsprChatResponseLength"] == responseLength.toString() }, "response length doesn't match")
                .matches(
                    { it.metadata["cwsprChatConversationType"] == CwsprChatConversationType.Chat.toString() },
                    "conversation type doesn't match"
                )
                .matches({ it.metadata["codewhispererCustomizationArn"] == "customizationArn" }, "user intent doesn't match")
                .matches({
                    it.metadata["cwsprChatHasProjectContext"] == CodeWhispererSettings.getInstance().isProjectContextEnabled().toString()
                }, "customization description doesn't match")
//                .matches({  it.metadata["cwsprChatFullResponseLatency"] == "" }, "latency") TODO
        }
    }

    @Test
    fun `recordInteractWithMessage - ChatItemVoted`() = runTest {
        mockClient.stub {
            on { this.sendChatInteractWithMessageTelemetry(any<ChatInteractWithMessageEvent>()) } doReturn mockSteResponse
        }

        sut.recordInteractWithMessage(IncomingCwcMessage.ChatItemVoted(tabId, messageId, "upvote"))

        // STE
        verify(mockClient).sendChatInteractWithMessageTelemetry(
            eq(
                ChatInteractWithMessageEvent.builder().apply {
                    conversationId(conversationId)
                    messageId(messageId)
                    interactionType(ChatMessageInteractionType.UPVOTE)
                    customizationArn(customizationArn)
                }.build()
            )
        )

        // Toolkit telemetry
        argumentCaptor<MetricEvent> {
            verify(mockBatcher).enqueue(capture())
            val event = firstValue.data.find { it.name == "amazonq_interactWithMessage" }
            assertNotNull(event)
            assertThat(event)
                .matches({ it.metadata["cwsprChatConversationId"] == conversationId }, "conversationId doesn't match")
                .matches({ it.metadata["cwsprChatMessageId"] == messageId }, "messageId doesn't match")
                .matches(
                    { it.metadata["cwsprChatInteractionType"] == CwsprChatInteractionType.Upvote.toString() },
                    "interaction type doesn't match"
                )
                .matches({ it.metadata["credentialStartUrl"] == mockUrl }, "startUrl doesn't match")
                .matches(
                    { it.metadata["cwsprChatHasProjectContext"] == CodeWhispererSettings.getInstance().isProjectContextEnabled().toString() },
                    "hasProjectContext doesn't match"
                )
        }
    }

    @Test
    fun `recordInteractWithMessage - FollowupClicked`() {
        mockClient.stub {
            on { this.sendChatInteractWithMessageTelemetry(any<ChatInteractWithMessageEvent>()) } doReturn mockSteResponse
        }

        runBlocking {
            sut.recordInteractWithMessage(IncomingCwcMessage.FollowupClicked(mock(), tabId, messageId, "command", "tabType"))
        }

        // STE
        verify(mockClient).sendChatInteractWithMessageTelemetry(
            eq(
                ChatInteractWithMessageEvent.builder().apply {
                    conversationId(conversationId)
                    messageId(messageId)
                    interactionType(ChatMessageInteractionType.CLICK_FOLLOW_UP)
                    customizationArn(customizationArn)
                }.build()
            )
        )

        // Toolkit telemetry
        argumentCaptor<MetricEvent> {
            verify(mockBatcher).enqueue(capture())
            val event = firstValue.data.find { it.name == "amazonq_interactWithMessage" }
            assertNotNull(event)
            assertThat(event)
                .matches({ it.metadata["cwsprChatConversationId"] == conversationId }, "conversationId doesn't match")
                .matches({ it.metadata["cwsprChatMessageId"] == messageId }, "messageId doesn't match")
                .matches(
                    { it.metadata["cwsprChatInteractionType"] == CwsprChatInteractionType.ClickFollowUp.toString() },
                    "interaction type doesn't match"
                )
                .matches({ it.metadata["credentialStartUrl"] == mockUrl }, "startUrl doesn't match")
                .matches(
                    { it.metadata["cwsprChatHasProjectContext"] == CodeWhispererSettings.getInstance().isProjectContextEnabled().toString() },
                    "hasProjectContext doesn't match"
                )
        }
    }

    @Test
    fun `recordInteractWithMessage - CopyCodeToClipboard`() = runTest {
        mockClient.stub {
            on { this.sendChatInteractWithMessageTelemetry(any<ChatInteractWithMessageEvent>()) } doReturn mockSteResponse
        }

        val codeBlockIndex = 1
        val totalCodeBlocks = 10

        sut.recordInteractWithMessage(
            IncomingCwcMessage.CopyCodeToClipboard(
                "command",
                tabId,
                messageId,
                "println()",
                "insertionTargetType",
                "eventId",
                codeBlockIndex,
                totalCodeBlocks
            )
        )

        // STE
        verify(mockClient).sendChatInteractWithMessageTelemetry(
            eq(
                ChatInteractWithMessageEvent.builder().apply {
                    conversationId(conversationId)
                    messageId(messageId)
                    interactionType(ChatMessageInteractionType.COPY_SNIPPET)
                    interactionTarget("insertionTargetType")
                    acceptedCharacterCount("println()".length)
                    customizationArn(customizationArn)
                }.build()
            )
        )

        // Toolkit telemetry
        argumentCaptor<MetricEvent> {
            verify(mockBatcher).enqueue(capture())
            val event = firstValue.data.find { it.name == "amazonq_interactWithMessage" }
            assertNotNull(event)
            assertThat(event)
                .matches({ it.metadata["cwsprChatConversationId"] == conversationId }, "conversationId doesn't match")
                .matches({ it.metadata["cwsprChatMessageId"] == messageId }, "messageId doesn't match")
                .matches(
                    { it.metadata["cwsprChatInteractionType"] == CwsprChatInteractionType.CopySnippet.toString() },
                    "interaction type doesn't match"
                )
                .matches({ it.metadata["cwsprChatAcceptedCharactersLength"] == "println()".length.toString() }, "acceptedCharLength doesn't match")
                .matches({ it.metadata["cwsprChatInteractionTarget"] == "insertionTargetType" }, "insertionTargetType doesn't match")
                .matches({ it.metadata["credentialStartUrl"] == mockUrl }, "startUrl doesn't match")
                .matches({ it.metadata["cwsprChatCodeBlockIndex"] == codeBlockIndex.toString() }, "cwsprChatCodeBlockIndex doesn't match")
                .matches({ it.metadata["cwsprChatTotalCodeBlocks"] == totalCodeBlocks.toString() }, "cwsprChatTotalCodeBlocks doesn't match")
                .matches(
                    { it.metadata["cwsprChatHasProjectContext"] == CodeWhispererSettings.getInstance().isProjectContextEnabled().toString() },
                    "hasProjectContext doesn't match"
                )
        }
    }

    @Test
    fun `recordInteractWithMessage - InsertCodeAtCursorPosition`() = runTest {
        mockClient.stub {
            on { this.sendChatInteractWithMessageTelemetry(any<ChatInteractWithMessageEvent>()) } doReturn mockSteResponse
        }

        val codeBlockIndex = 1
        val totalCodeBlocks = 10
        val inserTionTargetType = "insertionTargetType"
        val eventId = "eventId"
        val code = "println()"

        sut.recordInteractWithMessage(
            IncomingCwcMessage.InsertCodeAtCursorPosition(
                tabId,
                messageId,
                code,
                inserTionTargetType,
                emptyList(),
                eventId,
                codeBlockIndex,
                totalCodeBlocks
            )
        )

        // STE
        verify(mockClient).sendChatInteractWithMessageTelemetry(
            eq(
                ChatInteractWithMessageEvent.builder().apply {
                    conversationId(conversationId)
                    messageId(messageId)
                    interactionType(ChatMessageInteractionType.INSERT_AT_CURSOR)
                    interactionTarget(inserTionTargetType)
                    acceptedCharacterCount(code.length)
                    acceptedLineCount(code.lines().size)
                    customizationArn(customizationArn)
                }.build()
            )
        )

        // Toolkit telemetry
        argumentCaptor<MetricEvent> {
            verify(mockBatcher).enqueue(capture())
            val event = firstValue.data.find { it.name == "amazonq_interactWithMessage" }
            assertNotNull(event)
            assertThat(event).matches({ it.metadata["cwsprChatConversationId"] == conversationId }, "conversationId doesn't match")
                .matches({ it.metadata["cwsprChatMessageId"] == messageId }, "messageId doesn't match")
                .matches(
                    { it.metadata["cwsprChatInteractionType"] == CwsprChatInteractionType.InsertAtCursor.toString() },
                    "interaction type doesn't match"
                )
                .matches(
                    { it.metadata["cwsprChatAcceptedCharactersLength"] == code.length.toString() },
                    "cwsprChatAcceptedCharactersLength doesn't match"
                )
                .matches(
                    { it.metadata["cwsprChatAcceptedNumberOfLines"] == code.lines().size.toString() },
                    "cwsprChatAcceptedNumberOfLines doesn't match"
                )
                .matches({ it.metadata["cwsprChatInteractionTarget"] == inserTionTargetType }, "cwsprChatInteractionTarget doesn't match")
                .matches({ it.metadata["credentialStartUrl"] == mockUrl }, "credentialStartUrl doesn't match")
                .matches({ it.metadata["cwsprChatCodeBlockIndex"] == codeBlockIndex.toString() }, "cwsprChatCodeBlockIndex doesn't match")
                .matches({ it.metadata["cwsprChatTotalCodeBlocks"] == totalCodeBlocks.toString() }, "cwsprChatTotalCodeBlocks doesn't match")
                .matches(
                    { it.metadata["cwsprChatHasProjectContext"] == CodeWhispererSettings.getInstance().isProjectContextEnabled().toString() },
                    "hasProjectContext doesn't match"
                )
        }
    }

    @Test
    fun `recordInteractWithMessage - ClickedLink`() = runTest {
        mockClient.stub {
            on { this.sendChatInteractWithMessageTelemetry(any<ChatInteractWithMessageEvent>()) } doReturn mockSteResponse
        }

        val link = "https://foo.bar.com"
        sut.recordInteractWithMessage(
            IncomingCwcMessage.ClickedLink(
                LinkType.SourceLink,
                tabId,
                messageId,
                link
            )
        )

        // STE
        verify(mockClient).sendChatInteractWithMessageTelemetry(
            eq(
                ChatInteractWithMessageEvent.builder().apply {
                    conversationId(conversationId)
                    messageId(messageId)
                    interactionType(ChatMessageInteractionType.CLICK_LINK)
                    interactionTarget(link)
                    customizationArn(customizationArn)
                }.build()
            )
        )

        // Toolkit telemetry
        argumentCaptor<MetricEvent> {
            verify(mockBatcher).enqueue(capture())
            val event = firstValue.data.find { it.name == "amazonq_interactWithMessage" }
            assertNotNull(event)
            assertThat(event).matches({ it.metadata["cwsprChatConversationId"] == conversationId }, "conversationId doesn't match")
                .matches({ it.metadata["cwsprChatMessageId"] == messageId }, "messageId doesn't match")
                .matches(
                    { it.metadata["cwsprChatInteractionType"] == CwsprChatInteractionType.ClickLink.toString() },
                    "interaction type doesn't match"
                )
                .matches({ it.metadata["cwsprChatInteractionTarget"] == link }, "cwsprChatInteractionTarget doesn't match")
                .matches({ it.metadata["credentialStartUrl"] == mockUrl }, "credentialStartUrl doesn't match")
                .matches(
                    { it.metadata["cwsprChatHasProjectContext"] == CodeWhispererSettings.getInstance().isProjectContextEnabled().toString() },
                    "hasProjectContext doesn't match"
                )
        }
    }

    @Test
    fun `recordInteractWithMessage - ChatItemFeedback`() = runTest {
        mockClient.stub {
            on { this.sendChatInteractWithMessageTelemetry(any<ChatInteractWithMessageEvent>()) } doReturn mockSteResponse
        }

        val selectedOption = "foo"
        val comment = "bar"

        sut.recordInteractWithMessage(
            IncomingCwcMessage.ChatItemFeedback(
                tabId,
                selectedOption,
                comment,
                messageId,
            )
        )

        // TODO: STE, not implemented yet

        // Toolkit telemetry
        argumentCaptor<MetricEvent> {
            verify(mockBatcher).enqueue(capture())
            val event = firstValue.data.find { it.name == "feedback_result" }
            assertNotNull(event)
            assertThat(event).matches { it.metadata["result"] == "Succeeded" }
        }
    }
}
