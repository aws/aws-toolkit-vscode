// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session

import com.intellij.testFramework.RuleChain
import io.mockk.coEvery
import io.mockk.every
import io.mockk.just
import io.mockk.mockk
import io.mockk.mockkStatic
import io.mockk.runs
import io.mockk.unmockkAll
import kotlinx.coroutines.test.runTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.mock
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import software.aws.toolkits.jetbrains.services.amazonq.FeatureDevSessionContext
import software.aws.toolkits.jetbrains.services.amazonq.ZipCreationResult
import software.aws.toolkits.jetbrains.services.amazonq.messages.MessagePublisher
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.FeatureDevTestBase
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.sendAnswerPart
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.FeatureDevService
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.deleteUploadArtifact
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.uploadArtifactToS3
import java.io.File

class PrepareCodeGenerationStateTest : FeatureDevTestBase() {
    @Rule
    @JvmField
    val ruleChain = RuleChain(projectRule, disposableRule)

    private lateinit var prepareCodeGenerationState: PrepareCodeGenerationState
    private lateinit var repoContext: FeatureDevSessionContext
    private lateinit var sessionStateConfig: SessionStateConfig
    private lateinit var messenger: MessagePublisher
    private lateinit var featureDevService: FeatureDevService

    @Before
    override fun setup() {
        repoContext = mock()
        featureDevService = mockk<FeatureDevService>()
        every { featureDevService.project } returns projectRule.project
        messenger = mock()
        sessionStateConfig = SessionStateConfig(testConversationId, repoContext, featureDevService)
        prepareCodeGenerationState = PrepareCodeGenerationState(
            "",
            "tabId",
            sessionStateConfig,
            emptyList(),
            emptyList(),
            emptyList(),
            testUploadId,
            0,
            messenger
        )

        mockkStatic("software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.UploadArtifactKt")
        every { uploadArtifactToS3(any(), any(), any(), any(), any()) } just runs
        every { deleteUploadArtifact(any()) } just runs

        every { featureDevService.getTaskAssistCodeGeneration(any(), any()) } returns exampleCompleteGetTaskAssistCodeGenerationResponse
        every { featureDevService.startTaskAssistCodeGeneration(any(), any(), any()) } returns exampleStartTaskAssistConversationResponse
        coEvery { featureDevService.exportTaskAssistArchiveResult(any()) } returns exampleExportTaskAssistResultArchiveResponse

        mockkStatic(MessagePublisher::sendAnswerPart)
        coEvery { messenger.sendAnswerPart(any(), any()) } just runs
    }

    @After
    fun clear() {
        unmockkAll()
    }

    @Test
    fun `test interact`() {
        val mockFile: File = mock()
        val repoZipResult = ZipCreationResult(mockFile, testChecksumSha, testContentLength)
        val action = SessionStateAction("test-task", userMessage)

        whenever(repoContext.getProjectZip()).thenReturn(repoZipResult)
        every { featureDevService.createUploadUrl(any(), any(), any()) } returns exampleCreateUploadUrlResponse

        runTest {
            val actual = prepareCodeGenerationState.interact(action)
            assertThat(actual.nextState).isInstanceOf(PrepareCodeGenerationState::class.java)
            assertThat((actual.nextState as PrepareCodeGenerationState).uploadId).isEqualTo(testUploadId)
        }
        assertThat(prepareCodeGenerationState.phase).isEqualTo(SessionStatePhase.CODEGEN)
        verify(repoContext, times(1)).getProjectZip()
        io.mockk.verify(exactly = 1) { featureDevService.createUploadUrl(testConversationId, testChecksumSha, testContentLength) }
    }
}
