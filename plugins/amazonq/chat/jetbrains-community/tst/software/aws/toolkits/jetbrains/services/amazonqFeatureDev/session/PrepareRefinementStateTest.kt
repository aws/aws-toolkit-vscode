// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session

import com.intellij.testFramework.RuleChain
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
import org.mockito.kotlin.mock
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.FeatureDevTestBase
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.clients.FeatureDevClient
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.model.ZipCreationResult
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.uploadArtifactToS3
import java.io.File

class PrepareRefinementStateTest : FeatureDevTestBase() {
    @Rule
    @JvmField
    val ruleChain = RuleChain(projectRule, disposableRule)

    private lateinit var prepareRefinementState: PrepareRefinementState
    private lateinit var repoContext: FeatureDevSessionContext
    private lateinit var sessionStateConfig: SessionStateConfig
    private lateinit var featureDevClient: FeatureDevClient

    @Before
    override fun setup() {
        repoContext = mock()
        featureDevClient = mock()
        sessionStateConfig = SessionStateConfig(testConversationId, featureDevClient, repoContext)
        prepareRefinementState = PrepareRefinementState("", "tabId", sessionStateConfig)
        mockkStatic("software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.UploadArtifactKt")
        every { uploadArtifactToS3(any(), any(), any(), any(), any()) } just runs
    }

    @Test
    fun `test interact`() {
        val mockFile: File = mock()
        val repoZipResult = ZipCreationResult(mockFile, testChecksumSha, testContentLength)
        val action = SessionStateAction("test-task", userMessage)

        whenever(repoContext.getProjectZip()).thenReturn(repoZipResult)
        whenever(featureDevClient.createTaskAssistUploadUrl(testConversationId, testChecksumSha, testContentLength)).thenReturn(exampleCreateUploadUrlResponse)

        runTest {
            whenever(
                featureDevClient.generateTaskAssistPlan(testConversationId, exampleCreateUploadUrlResponse.uploadId(), userMessage)
            ).thenReturn(exampleGenerateTaskAssistPlanResult)

            val actual = prepareRefinementState.interact(action)
            assertThat(actual.nextState).isInstanceOf(RefinementState::class.java)
        }
        assertThat(prepareRefinementState.phase).isEqualTo(SessionStatePhase.APPROACH)
        verify(repoContext, times(1)).getProjectZip()
        verify(featureDevClient, times(1)).createTaskAssistUploadUrl(any(), any(), any())
    }
}
