// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session

import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.testFramework.RuleChain
import com.intellij.testFramework.replaceService
import io.mockk.every
import io.mockk.just
import io.mockk.mockkObject
import io.mockk.mockkStatic
import io.mockk.runs
import io.mockk.verify
import kotlinx.coroutines.test.runTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.mock
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import software.aws.toolkits.jetbrains.services.amazonq.messages.MessagePublisher
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.FeatureDevTestBase
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.clients.FeatureDevClient
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.resolveAndCreateOrUpdateFile
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.resolveAndDeleteFile
import software.aws.toolkits.jetbrains.services.cwc.controller.ReferenceLogController
import kotlin.io.path.Path

class SessionTest : FeatureDevTestBase() {
    @Rule
    @JvmField
    val ruleChain = RuleChain(projectRule, disposableRule)

    private lateinit var featureDevClient: FeatureDevClient
    private lateinit var session: Session
    private lateinit var messenger: MessagePublisher

    @Before
    override fun setup() {
        featureDevClient = mock()
        projectRule.project.replaceService(FeatureDevClient::class.java, featureDevClient, disposableRule.disposable)
        session = Session("tabId", projectRule.project)
        messenger = mock()
    }

    @Test
    fun `test session before preloader`() {
        assertThat(session.sessionState).isInstanceOf(ConversationNotStartedState::class.java)
        assertThat(session.isAuthenticating).isFalse()
    }

    @Test
    fun `test preloader`() = runTest {
        whenever(featureDevClient.createTaskAssistConversation()).thenReturn(exampleCreateTaskAssistConversationResponse)

        session.preloader(userMessage, messenger)
        assertThat(session.conversationId).isEqualTo(testConversationId)
        assertThat(session.sessionState).isInstanceOf(PrepareRefinementState::class.java)
        verify(featureDevClient, times(1)).createTaskAssistConversation()
    }

    @Test
    fun `test initCodegen`() {
        whenever(featureDevClient.createTaskAssistConversation()).thenReturn(exampleCreateTaskAssistConversationResponse)

        runTest {
            session.preloader(userMessage, messenger)
        }
        session.initCodegen(messenger)

        assertThat(session.latestMessage).isEqualTo("")
        assertThat(session.sessionState).isInstanceOf(PrepareCodeGenerationState::class.java)
    }

    @Test
    fun `test insertChanges`() {
        mockkStatic("com.intellij.openapi.vfs.VfsUtil")
        every { VfsUtil.markDirtyAndRefresh(true, true, true, any<VirtualFile>()) } just runs

        mockkObject(ReferenceLogController)
        every { ReferenceLogController.addReferenceLog(any(), any()) } just runs

        mockkStatic("software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.FileUtilsKt")
        every { resolveAndDeleteFile(any(), any()) } just runs
        every { resolveAndCreateOrUpdateFile(any(), any(), any()) } just runs

        val mockNewFile = listOf(NewFileZipInfo("test.ts", "testContent", false))
        val mockDeletedFile = listOf(DeletedFileInfo("deletedTest.ts", false))

        session.context.projectRoot = mock()
        whenever(session.context.projectRoot.toNioPath()).thenReturn(Path(""))

        session.insertChanges(mockNewFile, mockDeletedFile, emptyList())

        verify(exactly = 1) { resolveAndDeleteFile(any(), "deletedTest.ts") }
        verify(exactly = 1) { resolveAndCreateOrUpdateFile(any(), "test.ts", "testContent") }
        verify(exactly = 1) { ReferenceLogController.addReferenceLog(emptyList(), any()) }
        verify(exactly = 1) { VfsUtil.markDirtyAndRefresh(true, true, true, any<VirtualFile>()) }
    }
}
