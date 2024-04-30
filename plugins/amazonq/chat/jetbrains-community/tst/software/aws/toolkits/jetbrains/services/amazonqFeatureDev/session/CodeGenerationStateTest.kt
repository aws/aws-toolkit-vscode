// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session

import com.intellij.testFramework.RuleChain
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.just
import io.mockk.mockkStatic
import io.mockk.runs
import io.mockk.unmockkAll
import io.mockk.verify
import kotlinx.coroutines.test.runTest
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.mock
import software.aws.toolkits.jetbrains.services.amazonq.FeatureDevSessionContext
import software.aws.toolkits.jetbrains.services.amazonq.messages.MessagePublisher
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.FeatureDevException
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.FeatureDevTestBase
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.clients.FeatureDevClient
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.sendAnswerPart
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.exportTaskAssistArchiveResult
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.getTaskAssistCodeGeneration
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.startTaskAssistCodeGeneration
import software.aws.toolkits.resources.message

class CodeGenerationStateTest : FeatureDevTestBase() {
    @Rule
    @JvmField
    val ruleChain = RuleChain(projectRule, disposableRule)

    private lateinit var codeGenerationState: CodeGenerationState
    private lateinit var featureDevClient: FeatureDevClient
    private lateinit var messenger: MessagePublisher
    private val action = SessionStateAction("test-task", userMessage)

    @Before
    override fun setup() {
        featureDevClient = mock()
        messenger = mock()
        val repoContext = mock<FeatureDevSessionContext>()
        val sessionStateConfig = SessionStateConfig(testConversationId, featureDevClient, repoContext)

        codeGenerationState = CodeGenerationState(
            testTabId,
            "",
            sessionStateConfig,
            testUploadId,
            0,
            testRepositorySize,
            messenger
        )

        mockkStatic("software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.FeatureDevClientUtilKt")

        mockkStatic(MessagePublisher::sendAnswerPart)
        coEvery { messenger.sendAnswerPart(any(), any()) } just runs
    }

    @After
    fun clear() {
        unmockkAll()
    }

    @Test
    fun `test code generated is complete`() {
        val action = SessionStateAction("test-task", userMessage)
        every { getTaskAssistCodeGeneration(any(), any(), any()) } returns exampleCompleteGetTaskAssistCodeGenerationResponse
        every { startTaskAssistCodeGeneration(any(), any(), any(), any()) } returns exampleStartTaskAssistConversationResponse
        coEvery { exportTaskAssistArchiveResult(any(), any()) } returns CodeGenerationStreamResult(testFilePaths, testDeletedFiles, testReferences)

        runTest {
            val actual = codeGenerationState.interact(action)
            assertThat(actual.nextState).isInstanceOf(PrepareCodeGenerationState::class.java)
            val nextState = actual.nextState as PrepareCodeGenerationState
            assertThat(nextState.uploadId).isEqualTo(testUploadId)
            assertThat(nextState.phase).isEqualTo(SessionStatePhase.CODEGEN)
            assertThat(nextState.filePaths).isEqualTo(
                listOf(NewFileZipInfo("test.ts", "This is a comment", false))
            )
            assertThat(nextState.deletedFiles).isEqualTo(
                listOf(DeletedFileInfo("deleted.ts", false))
            )
            assertThat(nextState.references).isEqualTo(testReferences)
            assertThat(actual.interaction.interactionSucceeded).isEqualTo(true)
            assertThat(actual.interaction.content).isEqualTo("")
        }
        assertThat(codeGenerationState.phase).isEqualTo(SessionStatePhase.CODEGEN)
        coVerify(exactly = 1) { messenger.sendAnswerPart(testTabId, message("amazonqFeatureDev.code_generation.generating_code")) }
        verify(exactly = 1) { startTaskAssistCodeGeneration(featureDevClient, testConversationId, testUploadId, userMessage) }
        verify(exactly = 1) { getTaskAssistCodeGeneration(featureDevClient, testConversationId, testCodeGenerationId) }
        coVerify(exactly = 1) { exportTaskAssistArchiveResult(featureDevClient, testConversationId) }
    }

    @Test(expected = FeatureDevException::class)
    fun `test code generation failed`() = runTest {
        every { startTaskAssistCodeGeneration(any(), any(), any(), any()) } returns exampleStartTaskAssistConversationResponse
        every { getTaskAssistCodeGeneration(any(), any(), any()) } returns exampleFailedGetTaskAssistCodeGenerationResponse

        codeGenerationState.interact(action)

        verify(exactly = 1) { startTaskAssistCodeGeneration(featureDevClient, testConversationId, testUploadId, userMessage) }
        verify(exactly = 1) { getTaskAssistCodeGeneration(featureDevClient, testConversationId, testCodeGenerationId) }
        coVerify(exactly = 0) { exportTaskAssistArchiveResult(any(), any()) }
    }

    @Test
    fun `test code generation returns any other handled status`() {
        every { startTaskAssistCodeGeneration(any(), any(), any(), any()) } returns exampleStartTaskAssistConversationResponse
        every { getTaskAssistCodeGeneration(any(), any(), any()) } returns exampleOtherGetTaskAssistCodeGenerationResponse

        assertThatThrownBy {
            runTest {
                codeGenerationState.interact(action)
            }
        }.isExactlyInstanceOf(IllegalStateException::class.java).withFailMessage("Unknown status: $otherStatus")

        verify(exactly = 1) { startTaskAssistCodeGeneration(featureDevClient, testConversationId, testUploadId, userMessage) }
        verify(exactly = 1) { getTaskAssistCodeGeneration(featureDevClient, testConversationId, testCodeGenerationId) }
        coVerify(exactly = 0) { exportTaskAssistArchiveResult(any(), any()) }
    }

    @Test
    fun `test code generation returns in progress at least once`() {
        every { startTaskAssistCodeGeneration(any(), any(), any(), any()) } returns exampleStartTaskAssistConversationResponse
        every {
            getTaskAssistCodeGeneration(any(), any(), any())
        } returnsMany listOf(exampleGetTaskAssistConversationResponse, exampleCompleteGetTaskAssistCodeGenerationResponse)
        coEvery { exportTaskAssistArchiveResult(any(), any()) } returns CodeGenerationStreamResult(emptyMap(), emptyList(), emptyList())

        runTest {
            codeGenerationState.interact(action)
        }

        verify(exactly = 1) { startTaskAssistCodeGeneration(featureDevClient, testConversationId, testUploadId, userMessage) }
        verify(exactly = 2) { getTaskAssistCodeGeneration(featureDevClient, testConversationId, testCodeGenerationId) }
        coVerify(exactly = 1) { exportTaskAssistArchiveResult(featureDevClient, testConversationId) }
    }

    @Test
    fun `test using all polling count`() {
        every { startTaskAssistCodeGeneration(any(), any(), any(), any()) } returns exampleStartTaskAssistConversationResponse
        every { getTaskAssistCodeGeneration(any(), any(), any()) } returns exampleGetTaskAssistConversationResponse

        runTest {
            val actual = codeGenerationState.interact(action)
            assertThat(actual.nextState).isInstanceOf(PrepareCodeGenerationState::class.java)
            val nextState = actual.nextState as PrepareCodeGenerationState
            assertThat(nextState.filePaths).isEqualTo(emptyList<NewFileZipInfo>())
            assertThat(nextState.deletedFiles).isEqualTo(emptyList<String>())
            assertThat(nextState.references).isEqualTo(emptyList<CodeReferenceGenerated>())
            assertThat(actual.interaction.interactionSucceeded).isEqualTo(true)
            assertThat(actual.interaction.content).isEqualTo("")
        }

        verify(exactly = 1) { startTaskAssistCodeGeneration(featureDevClient, testConversationId, testUploadId, userMessage) }
        verify(exactly = 180) { getTaskAssistCodeGeneration(featureDevClient, testConversationId, testCodeGenerationId) }
        coVerify(exactly = 0) { exportTaskAssistArchiveResult(featureDevClient, testConversationId) }
    }
}
