// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.controller

import com.intellij.testFramework.RuleChain
import com.intellij.testFramework.replaceService
import io.mockk.every
import io.mockk.just
import io.mockk.mockkStatic
import io.mockk.runs
import kotlinx.coroutines.test.runTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.mockito.kotlin.spy
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import software.aws.toolkits.jetbrains.services.amazonq.apps.AmazonQAppInitContext
import software.aws.toolkits.jetbrains.services.amazonq.auth.AuthController
import software.aws.toolkits.jetbrains.services.amazonq.auth.AuthNeededStates
import software.aws.toolkits.jetbrains.services.amazonq.messages.MessagePublisher
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.FeatureDevTestBase
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.clients.FeatureDevClient
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.IncomingFeatureDevMessage
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session.RefinementState
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session.Session
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.storage.ChatSessionStorage
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.uploadArtifactToS3

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

    private val tabId = "tabId"

    @Before
    override fun setup() {
        super.setup()
        featureDevClient = mock()
        messenger = mock()
        chatSessionStorage = mock()
        appContext = mock<AmazonQAppInitContext> {
            on { project }.thenReturn(project)
            on { messagesFromAppToUi }.thenReturn(messenger)
        }
        authController = spy(AuthController())
        mockkStatic("software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.UploadArtifactKt")
        every { uploadArtifactToS3(any(), any(), any(), any(), any()) } just runs

        controller = FeatureDevController(appContext, chatSessionStorage, authController)
    }

    @Test
    fun `test new tab opened`() {
        val message = IncomingFeatureDevMessage.NewTabCreated("new-tab-created", tabId)
        spySession = spy(Session("tabId", project))
        whenever(chatSessionStorage.getSession(any(), any())).thenReturn(spySession)

        runTest {
            controller.processNewTabCreatedMessage(message)
        }
        verify(authController, times(1)).getAuthNeededStates(project)
        verify(chatSessionStorage, times(1)).getSession(tabId, project)
        assertThat(spySession.isAuthenticating).isTrue()
    }

    @Test
    fun `test handle chat for planning phase`() {
        val testAuth = AuthNeededStates(amazonQ = null)
        val message: IncomingFeatureDevMessage.ChatPrompt = IncomingFeatureDevMessage.ChatPrompt(userMessage, "chat-prompt", tabId)
        projectRule.project.replaceService(FeatureDevClient::class.java, featureDevClient, disposableRule.disposable)
        spySession = spy(Session("tabId", project))

        doReturn(testAuth).`when`(authController).getAuthNeededStates(any())
        whenever(chatSessionStorage.getSession(any(), any())).thenReturn(spySession)
        whenever(featureDevClient.createTaskAssistConversation()).thenReturn(exampleCreateTaskAssistConversationResponse)
        whenever(featureDevClient.createTaskAssistUploadUrl(any(), any(), any())).thenReturn(exampleCreateUploadUrlResponse)

        runTest {
            whenever(featureDevClient.generateTaskAssistPlan(any(), any(), any())).thenReturn(exampleGenerateTaskAssistPlanResult)

            controller.processPromptChatMessage(message)

            verify(spySession, times(1)).preloader(any(), any())
            verify(spySession, times(1)).send(any())
            assertThat(spySession.send(userMessage).content?.trim()).isEqualTo(exampleGenerateTaskAssistPlanResult.approach)
            assertThat(spySession.send(userMessage).interactionSucceeded).isTrue()
        }
        verify(authController, times(1)).getAuthNeededStates(any())
        assertThat(spySession.sessionState).isInstanceOf(RefinementState::class.java)
    }
}
