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
import software.aws.toolkits.jetbrains.services.amazonq.FeatureDevSessionContext
import software.aws.toolkits.jetbrains.services.amazonq.ZipCreationResult
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.FeatureDevTestBase
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.FeatureDevService
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.uploadArtifactToS3
import java.io.File

class PrepareRefinementStateTest : FeatureDevTestBase() {
    @Rule
    @JvmField
    val ruleChain = RuleChain(projectRule, disposableRule)

    private lateinit var prepareRefinementState: PrepareRefinementState
    private lateinit var repoContext: FeatureDevSessionContext
    private lateinit var sessionStateConfig: SessionStateConfig
    private lateinit var featureDevService: FeatureDevService

    @Before
    override fun setup() {
        repoContext = mock()
        featureDevService = mock()
        sessionStateConfig = SessionStateConfig(testConversationId, repoContext, featureDevService)
        prepareRefinementState = PrepareRefinementState("", "tabId", sessionStateConfig)
        mockkStatic("software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.UploadArtifactKt")
        every { uploadArtifactToS3(any(), any(), any(), any(), any()) } just runs
        whenever(featureDevService.project).thenReturn(projectRule.project)
    }

    @Test
    fun `test interact`() {
        val mockFile: File = mock()
        val repoZipResult = ZipCreationResult(mockFile, testChecksumSha, testContentLength)
        val action = SessionStateAction("test-task", userMessage)

        whenever(repoContext.getProjectZip()).thenReturn(repoZipResult)
        whenever(featureDevService.createUploadUrl(testConversationId, testChecksumSha, testContentLength)).thenReturn(exampleCreateUploadUrlResponse)

        runTest {
            whenever(
                featureDevService.generatePlan(testConversationId, exampleCreateUploadUrlResponse.uploadId(), userMessage, 0)
            ).thenReturn(exampleGenerateTaskAssistPlanResult)

            val actual = prepareRefinementState.interact(action)
            assertThat(actual.nextState).isInstanceOf(RefinementState::class.java)
        }
        assertThat(prepareRefinementState.phase).isEqualTo(SessionStatePhase.APPROACH)
        verify(repoContext, times(1)).getProjectZip()
        verify(featureDevService, times(1)).createUploadUrl(any(), any(), any())
    }
}
