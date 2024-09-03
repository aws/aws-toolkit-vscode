// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.controller

import com.intellij.testFramework.LightVirtualFile
import com.intellij.testFramework.RuleChain
import com.intellij.testFramework.replaceService
import io.mockk.coVerify
import io.mockk.coVerifyOrder
import io.mockk.every
import io.mockk.just
import io.mockk.mockkObject
import io.mockk.mockkStatic
import io.mockk.runs
import io.mockk.unmockkAll
import io.mockk.verify
import kotlinx.coroutines.test.runTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.doNothing
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.mockito.kotlin.reset
import org.mockito.kotlin.spy
import org.mockito.kotlin.times
import org.mockito.kotlin.whenever
import software.aws.toolkits.jetbrains.services.amazonq.apps.AmazonQAppInitContext
import software.aws.toolkits.jetbrains.services.amazonq.auth.AuthController
import software.aws.toolkits.jetbrains.services.amazonq.auth.AuthNeededStates
import software.aws.toolkits.jetbrains.services.amazonq.messages.MessagePublisher
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.FeatureDevTestBase
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.clients.FeatureDevClient
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.FeatureDevMessageType
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.FollowUp
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.FollowUpStatusType
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.FollowUpTypes
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.IncomingFeatureDevMessage
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.sendAnswer
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.sendAsyncEventProgress
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.sendChatInputEnabledMessage
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.sendCodeResult
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.sendSystemPrompt
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.sendUpdatePlaceholder
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.updateFileComponent
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session.DeletedFileInfo
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session.Interaction
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session.NewFileZipInfo
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session.PrepareCodeGenerationState
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session.Session
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session.SessionStatePhase
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.storage.ChatSessionStorage
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.getFollowUpOptions
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.selectFolder
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.uploadArtifactToS3
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.AmazonqTelemetry
import org.mockito.kotlin.verify as mockitoVerify

class FeatureDevControllerTest : FeatureDevTestBase() {
    @Rule
    @JvmField
    val ruleChain = RuleChain(projectRule, disposableRule)

    private lateinit var controller: FeatureDevController
    private lateinit var messenger: MessagePublisher
    private lateinit var chatSessionStorage: ChatSessionStorage
    private lateinit var appContext: AmazonQAppInitContext
    private lateinit var authController: AuthController
    private lateinit var spySession: Session
    private lateinit var featureDevClient: FeatureDevClient

    private val newFileContents = listOf(
        NewFileZipInfo("test.ts", "This is a comment", false),
        NewFileZipInfo("test2.ts", "This is a rejected file", true)
    )
    private val deletedFiles = listOf(
        DeletedFileInfo("delete.ts", false),
        DeletedFileInfo("delete2.ts", true)
    )

    @Before
    override fun setup() {
        super.setup()
        featureDevClient = mock()
        messenger = mock()
        chatSessionStorage = mock()
        projectRule.project.replaceService(FeatureDevClient::class.java, featureDevClient, disposableRule.disposable)
        appContext = mock<AmazonQAppInitContext> {
            on { project }.thenReturn(project)
            on { messagesFromAppToUi }.thenReturn(messenger)
        }
        authController = spy(AuthController())
        doReturn(AuthNeededStates()).`when`(authController).getAuthNeededStates(any())
        spySession = spy(Session(testTabId, project))

        mockkStatic(
            MessagePublisher::sendAnswer,
            MessagePublisher::sendSystemPrompt,
            MessagePublisher::sendUpdatePlaceholder,
            MessagePublisher::sendChatInputEnabledMessage,
            MessagePublisher::sendCodeResult,
            MessagePublisher::updateFileComponent
        )

        mockkStatic("software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.UploadArtifactKt")
        every { uploadArtifactToS3(any(), any(), any(), any(), any()) } just runs

        controller = FeatureDevController(appContext, chatSessionStorage, authController)
    }

    @After
    fun clear() {
        unmockkAll()
    }

    @Test
    fun `test new tab opened`() {
        val message = IncomingFeatureDevMessage.NewTabCreated("new-tab-created", testTabId)
        spySession = spy(Session("tabId", project))
        whenever(chatSessionStorage.getSession(any(), any())).thenReturn(spySession)
        reset(authController) // needed to have actual logic to test the isAuthenticating later

        runTest {
            controller.processNewTabCreatedMessage(message)
        }
        mockitoVerify(authController, times(1)).getAuthNeededStates(project)
        mockitoVerify(chatSessionStorage, times(1)).getSession(testTabId, project)
        assertThat(spySession.isAuthenticating).isTrue()
    }

    @Test
    fun `test newTask and closeSession followUp`() {
        /*
            Testing both followups together as they share logic, atm they could be verified together.
         */
        val followUp = FollowUp(FollowUpTypes.NEW_TASK, pillText = "Work on new task")
        val message = IncomingFeatureDevMessage.FollowupClicked(followUp, testTabId, "", "test-command")

        whenever(featureDevClient.createTaskAssistConversation()).thenReturn(exampleCreateTaskAssistConversationResponse)
        whenever(featureDevClient.sendFeatureDevTelemetryEvent(any())).thenReturn(exampleSendTelemetryEventResponse)
        whenever(chatSessionStorage.getSession(any(), any())).thenReturn(spySession)
        doNothing().`when`(chatSessionStorage).deleteSession(any())

        mockkObject(AmazonqTelemetry)
        every { AmazonqTelemetry.endChat(amazonqConversationId = any(), amazonqEndOfTheConversationLatency = any()) } just runs

        runTest {
            spySession.preloader(userMessage, messenger)
            controller.processFollowupClickedMessage(message)
        }

        mockitoVerify(chatSessionStorage, times(1)).deleteSession(testTabId)

        coVerifyOrder {
            messenger.sendAnswer(testTabId, message("amazonqFeatureDev.chat_message.closed_session"), FeatureDevMessageType.Answer)
            messenger.sendUpdatePlaceholder(testTabId, message("amazonqFeatureDev.placeholder.closed_session"))
            messenger.sendChatInputEnabledMessage(testTabId, false)
            messenger.sendAnswer(testTabId, message("amazonqFeatureDev.chat_message.ask_for_new_task"), FeatureDevMessageType.Answer)
            messenger.sendUpdatePlaceholder(testTabId, message("amazonqFeatureDev.placeholder.new_plan"))
        }

        verify(
            exactly = 1
        ) { AmazonqTelemetry.endChat(amazonqConversationId = testConversationId, amazonqEndOfTheConversationLatency = any(), createTime = any()) }
    }

    @Test
    fun `test provideFeedbackAndRegenerateCode`() = runTest {
        val followUp = FollowUp(FollowUpTypes.PROVIDE_FEEDBACK_AND_REGENERATE_CODE, pillText = "Regenerate code")
        val message = IncomingFeatureDevMessage.FollowupClicked(followUp, testTabId, "", "test-command")

        whenever(featureDevClient.createTaskAssistConversation()).thenReturn(exampleCreateTaskAssistConversationResponse)
        whenever(featureDevClient.sendFeatureDevTelemetryEvent(any())).thenReturn(exampleSendTelemetryEventResponse)
        whenever(chatSessionStorage.getSession(any(), any())).thenReturn(spySession)

        mockkObject(AmazonqTelemetry)
        every { AmazonqTelemetry.isProvideFeedbackForCodeGen(amazonqConversationId = any(), enabled = any()) } just runs

        spySession.preloader(userMessage, messenger)
        controller.processFollowupClickedMessage(message)

        coVerifyOrder {
            AmazonqTelemetry.isProvideFeedbackForCodeGen(amazonqConversationId = testConversationId, enabled = true, createTime = any())
            messenger.sendAsyncEventProgress(testTabId, inProgress = false)
            messenger.sendAnswer(testTabId, message("amazonqFeatureDev.code_generation.provide_code_feedback"), FeatureDevMessageType.Answer)
            messenger.sendUpdatePlaceholder(testTabId, message("amazonqFeatureDev.placeholder.provide_code_feedback"))
        }
    }

    @Test
    fun `test insertCode`() = runTest {
        val followUp = FollowUp(FollowUpTypes.INSERT_CODE, pillText = "Insert code")
        val message = IncomingFeatureDevMessage.FollowupClicked(followUp, testTabId, "", "test-command")

        mockkObject(AmazonqTelemetry)
        every {
            AmazonqTelemetry.isAcceptedCodeChanges(amazonqNumberOfFilesAccepted = any(), amazonqConversationId = any(), enabled = any())
        } just runs

        whenever(featureDevClient.createTaskAssistConversation()).thenReturn(exampleCreateTaskAssistConversationResponse)
        whenever(featureDevClient.sendFeatureDevTelemetryEvent(any())).thenReturn(exampleSendTelemetryEventResponse)
        whenever(chatSessionStorage.getSession(any(), any())).thenReturn(spySession)
        whenever(spySession.sessionState).thenReturn(
            PrepareCodeGenerationState(
                testTabId, "", mock(), newFileContents, deletedFiles, testReferences, testUploadId, 0, messenger
            )
        )
        doNothing().`when`(spySession).insertChanges(any(), any(), any())

        spySession.preloader(userMessage, messenger)
        controller.processFollowupClickedMessage(message)

        mockitoVerify(
            spySession,
            times(1)
        ).insertChanges(listOf(newFileContents[0]), listOf(deletedFiles[0]), testReferences) // insert changes for only non rejected files
        coVerifyOrder {
            AmazonqTelemetry.isAcceptedCodeChanges(
                amazonqNumberOfFilesAccepted = 2.0, // it should be 2 files per test setup
                amazonqConversationId = spySession.conversationId,
                enabled = true,
                createTime = any()
            )
            messenger.sendAnswer(testTabId, message("amazonqFeatureDev.code_generation.updated_code"), FeatureDevMessageType.Answer)
            messenger.sendSystemPrompt(
                testTabId,
                listOf(
                    FollowUp(FollowUpTypes.NEW_TASK, message("amazonqFeatureDev.follow_up.new_task"), status = FollowUpStatusType.Info),
                    FollowUp(FollowUpTypes.CLOSE_SESSION, message("amazonqFeatureDev.follow_up.close_session"), status = FollowUpStatusType.Info)
                )
            )
            messenger.sendChatInputEnabledMessage(testTabId, true)
            messenger.sendUpdatePlaceholder(testTabId, message("amazonqFeatureDev.placeholder.additional_improvements"))
        }
    }

    @Test
    fun `test handleChat onCodeGeneration succeeds to create files`() = runTest {
        val mockInteraction = mock<Interaction>()

        val mockSession = mock<Session>()
        whenever(mockSession.send(userMessage)).thenReturn(mockInteraction)
        whenever(mockSession.conversationId).thenReturn(testConversationId)
        whenever(mockSession.sessionState).thenReturn(
            PrepareCodeGenerationState(
                testTabId, "", mock(), newFileContents, deletedFiles, testReferences, testUploadId, 0, messenger
            )
        )

        controller.onCodeGeneration(mockSession, userMessage, testTabId)

        coVerifyOrder {
            messenger.sendAsyncEventProgress(testTabId, true, message("amazonqFeatureDev.chat_message.start_code_generation"))
            messenger.sendAnswer(testTabId, message("amazonqFeatureDev.chat_message.requesting_changes"), FeatureDevMessageType.AnswerStream)
            messenger.sendUpdatePlaceholder(testTabId, message("amazonqFeatureDev.placeholder.generating_code"))
            messenger.sendCodeResult(testTabId, testUploadId, newFileContents, deletedFiles, testReferences)
            messenger.sendSystemPrompt(testTabId, getFollowUpOptions(SessionStatePhase.CODEGEN))
            messenger.sendUpdatePlaceholder(testTabId, message("amazonqFeatureDev.placeholder.after_code_generation"))
            messenger.sendAsyncEventProgress(testTabId, false)
            messenger.sendChatInputEnabledMessage(testTabId, false)
        }
    }

    @Test(expected = RuntimeException::class)
    fun `test handleChat onCodeGeneration throws error when sending message to state`() = runTest {
        val mockSession = mock<Session>()

        whenever(mockSession.send(userMessage)).thenThrow(RuntimeException())
        whenever(mockSession.conversationId).thenReturn(testConversationId)

        controller.onCodeGeneration(mockSession, userMessage, testTabId)

        coVerifyOrder {
            messenger.sendAsyncEventProgress(testTabId, true, message("amazonqFeatureDev.chat_message.start_code_generation"))
            messenger.sendAnswer(testTabId, message("amazonqFeatureDev.chat_message.requesting_changes"), FeatureDevMessageType.AnswerStream)
            messenger.sendUpdatePlaceholder(testTabId, message("amazonqFeatureDev.placeholder.generating_code"))
            messenger.sendAsyncEventProgress(testTabId, false)
            messenger.sendChatInputEnabledMessage(testTabId, false)
        }
    }

    @Test
    fun `test handleChat onCodeGeneration doesn't return any files with retries`() = runTest {
        val filePaths = emptyList<NewFileZipInfo>()
        val deletedFiles = emptyList<DeletedFileInfo>()

        val mockInteraction = mock<Interaction>()

        val mockSession = mock<Session>()
        whenever(mockSession.send(userMessage)).thenReturn(mockInteraction)
        whenever(mockSession.conversationId).thenReturn(testConversationId)
        whenever(mockSession.sessionState).thenReturn(
            PrepareCodeGenerationState(
                testTabId, "", mock(), filePaths, deletedFiles, testReferences, testUploadId, 0, messenger
            )
        )
        whenever(mockSession.retries).thenReturn(3)

        controller.onCodeGeneration(mockSession, userMessage, testTabId)

        coVerifyOrder {
            messenger.sendAnswer(testTabId, message("amazonqFeatureDev.code_generation.no_file_changes"), FeatureDevMessageType.Answer)
            messenger.sendSystemPrompt(
                testTabId,
                listOf(FollowUp(FollowUpTypes.RETRY, message("amazonqFeatureDev.follow_up.retry"), status = FollowUpStatusType.Warning))
            )
            messenger.sendChatInputEnabledMessage(testTabId, false)
        }
    }

    @Test
    fun `test handleChat onCodeGeneration doesn't return any files no retries`() = runTest {
        val filePaths = emptyList<NewFileZipInfo>()
        val deletedFiles = emptyList<DeletedFileInfo>()

        val mockInteraction = mock<Interaction>()

        val mockSession = mock<Session>()
        whenever(mockSession.send(userMessage)).thenReturn(mockInteraction)
        whenever(mockSession.conversationId).thenReturn(testConversationId)
        whenever(mockSession.sessionState).thenReturn(
            PrepareCodeGenerationState(
                testTabId, "", mock(), filePaths, deletedFiles, testReferences, testUploadId, 0, messenger
            )
        )
        whenever(mockSession.retries).thenReturn(0)

        controller.onCodeGeneration(mockSession, userMessage, testTabId)

        coVerifyOrder {
            messenger.sendAnswer(testTabId, message("amazonqFeatureDev.code_generation.no_file_changes"), FeatureDevMessageType.Answer)
            messenger.sendSystemPrompt(testTabId, emptyList())
            messenger.sendChatInputEnabledMessage(testTabId, false)
        }
    }

    @Test
    fun `test processFileClicked changes the state of the clicked file`() = runTest {
        val message = IncomingFeatureDevMessage.FileClicked(testTabId, newFileContents[0].zipFilePath, "", "")

        whenever(featureDevClient.createTaskAssistConversation()).thenReturn(exampleCreateTaskAssistConversationResponse)
        whenever(chatSessionStorage.getSession(any(), any())).thenReturn(spySession)
        whenever(spySession.sessionState).thenReturn(
            PrepareCodeGenerationState(
                testTabId, "", mock(), newFileContents, deletedFiles, testReferences, testUploadId, 0, messenger
            )
        )

        controller.processFileClicked(message)

        val newFileContentsCopy = newFileContents.toList()
        newFileContentsCopy[0].rejected = !newFileContentsCopy[0].rejected
        coVerify { messenger.updateFileComponent(testTabId, newFileContentsCopy, deletedFiles, "") }
    }

    @Test
    fun `test modifyDefaultSourceFolder customer does not select a folder`() = runTest {
        val followUp = FollowUp(FollowUpTypes.MODIFY_DEFAULT_SOURCE_FOLDER, pillText = "Modify default source folder")
        val message = IncomingFeatureDevMessage.FollowupClicked(followUp, testTabId, "", "test-command")

        whenever(featureDevClient.createTaskAssistConversation()).thenReturn(exampleCreateTaskAssistConversationResponse)
        whenever(featureDevClient.sendFeatureDevTelemetryEvent(any())).thenReturn(exampleSendTelemetryEventResponse)
        whenever(chatSessionStorage.getSession(any(), any())).thenReturn(spySession)

        mockkStatic("software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.FileUtilsKt")
        every { selectFolder(any(), any()) } returns null

        spySession.preloader(userMessage, messenger)
        controller.processFollowupClickedMessage(message)

        coVerifyOrder {
            messenger.sendSystemPrompt(
                tabId = testTabId,
                followUp = listOf(
                    FollowUp(
                        pillText = message("amazonqFeatureDev.follow_up.modify_source_folder"),
                        type = FollowUpTypes.MODIFY_DEFAULT_SOURCE_FOLDER,
                        status = FollowUpStatusType.Info,
                    )
                )
            )
        }
    }

    @Test
    fun `test modifyDefaultSourceFolder customer selects a folder outside the workspace`() = runTest {
        val followUp = FollowUp(FollowUpTypes.MODIFY_DEFAULT_SOURCE_FOLDER, pillText = "Modify default source folder")
        val message = IncomingFeatureDevMessage.FollowupClicked(followUp, testTabId, "", "test-command")

        whenever(featureDevClient.createTaskAssistConversation()).thenReturn(exampleCreateTaskAssistConversationResponse)
        whenever(featureDevClient.sendFeatureDevTelemetryEvent(any())).thenReturn(exampleSendTelemetryEventResponse)
        whenever(chatSessionStorage.getSession(any(), any())).thenReturn(spySession)

        mockkStatic("software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.FileUtilsKt")
        every { selectFolder(any(), any()) } returns LightVirtualFile("/path")

        spySession.preloader(userMessage, messenger)
        controller.processFollowupClickedMessage(message)

        coVerifyOrder {
            messenger.sendAnswer(
                tabId = testTabId,
                messageType = FeatureDevMessageType.Answer,
                message = message("amazonqFeatureDev.follow_up.incorrect_source_folder")
            )
            messenger.sendSystemPrompt(
                tabId = testTabId,
                followUp = listOf(
                    FollowUp(
                        pillText = message("amazonqFeatureDev.follow_up.modify_source_folder"),
                        type = FollowUpTypes.MODIFY_DEFAULT_SOURCE_FOLDER,
                        status = FollowUpStatusType.Info,
                    )
                )
            )
        }
    }

    @Test
    fun `test modifyDefaultSourceFolder customer selects a correct sub folder`() = runTest {
        val followUp = FollowUp(FollowUpTypes.MODIFY_DEFAULT_SOURCE_FOLDER, pillText = "Modify default source folder")
        val message = IncomingFeatureDevMessage.FollowupClicked(followUp, testTabId, "", "test-command")

        whenever(featureDevClient.createTaskAssistConversation()).thenReturn(exampleCreateTaskAssistConversationResponse)
        whenever(featureDevClient.sendFeatureDevTelemetryEvent(any())).thenReturn(exampleSendTelemetryEventResponse)
        whenever(chatSessionStorage.getSession(any(), any())).thenReturn(spySession)

        val folder = LightVirtualFile("${spySession.context.projectRoot.name}/path/to/sub/folder")
        mockkStatic("software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.FileUtilsKt")
        every { selectFolder(any(), any()) } returns folder

        spySession.preloader(userMessage, messenger)
        controller.processFollowupClickedMessage(message)

        coVerify {
            messenger.sendAnswer(
                tabId = testTabId,
                messageType = FeatureDevMessageType.Answer,
                message = message("amazonqFeatureDev.follow_up.modified_source_folder", folder.path)
            )
        }
    }
}
