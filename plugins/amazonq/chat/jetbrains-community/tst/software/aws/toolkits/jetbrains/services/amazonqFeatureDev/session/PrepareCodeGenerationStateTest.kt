// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session

import com.intellij.testFramework.RuleChain
import io.mockk.coEvery
import io.mockk.every
import io.mockk.just
import io.mockk.mockkStatic
import io.mockk.runs
import io.mockk.unmockkAll
import kotlinx.coroutines.test.runTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.mock
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import software.aws.toolkits.jetbrains.services.amazonq.FeatureDevSessionContext
import software.aws.toolkits.jetbrains.services.amazonq.ZipCreationResult
import software.aws.toolkits.jetbrains.services.amazonq.messages.MessagePublisher
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.FeatureDevTestBase
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.clients.FeatureDevClient
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.messages.sendAnswerPart
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.deleteUploadArtifact
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.exportTaskAssistArchiveResult
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.getTaskAssistCodeGeneration
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.startTaskAssistCodeGeneration
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.uploadArtifactToS3
import java.io.File

class PrepareCodeGenerationStateTest : FeatureDevTestBase() {
    @Rule
    @JvmField
    val ruleChain = RuleChain(projectRule, disposableRule)

    private lateinit var prepareCodeGenerationState: PrepareCodeGenerationState
    private lateinit var repoContext: FeatureDevSessionContext
    private lateinit var sessionStateConfig: SessionStateConfig
    private lateinit var featureDevClient: FeatureDevClient
    private lateinit var messenger: MessagePublisher

    @Before
    override fun setup() {
        repoContext = mock()
        featureDevClient = mock()
        messenger = mock()
        sessionStateConfig = SessionStateConfig(testConversationId, featureDevClient, repoContext)
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

        mockkStatic("software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.FeatureDevClientUtilKt")
        every { getTaskAssistCodeGeneration(any(), any(), any()) } returns exampleCompleteGetTaskAssistCodeGenerationResponse
        every { startTaskAssistCodeGeneration(any(), any(), any(), any()) } returns exampleStartTaskAssistConversationResponse
        coEvery { exportTaskAssistArchiveResult(any(), any()) } returns exampleExportTaskAssistResultArchiveResponse

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
        whenever(featureDevClient.createTaskAssistUploadUrl(testConversationId, testChecksumSha, testContentLength)).thenReturn(exampleCreateUploadUrlResponse)

        runTest {
            val actual = prepareCodeGenerationState.interact(action)
            assertThat(actual.nextState).isInstanceOf(PrepareCodeGenerationState::class.java)
            assertThat((actual.nextState as PrepareCodeGenerationState).uploadId).isEqualTo(testUploadId)
        }
        assertThat(prepareCodeGenerationState.phase).isEqualTo(SessionStatePhase.CODEGEN)
        verify(repoContext, times(1)).getProjectZip()
        verify(featureDevClient, times(1)).createTaskAssistUploadUrl(any(), any(), any())
    }
}
