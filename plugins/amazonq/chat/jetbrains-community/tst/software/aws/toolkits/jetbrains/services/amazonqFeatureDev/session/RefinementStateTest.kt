// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session

import com.intellij.testFramework.RuleChain
import kotlinx.coroutines.test.runTest
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.mock
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import software.aws.toolkits.jetbrains.services.amazonq.FeatureDevSessionContext
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.FeatureDevException
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.FeatureDevTestBase
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.clients.GenerateTaskAssistPlanResult
import software.aws.toolkits.jetbrains.services.amazonqFeatureDev.util.FeatureDevService
import software.aws.toolkits.resources.message

class RefinementStateTest : FeatureDevTestBase() {
    @Rule
    @JvmField
    val ruleChain = RuleChain(projectRule, disposableRule)

    private lateinit var refinementState: RefinementState
    private lateinit var sessionStateConfig: SessionStateConfig
    private lateinit var repoContext: FeatureDevSessionContext
    private lateinit var featureDevService: FeatureDevService

    private val action = SessionStateAction("test-task", userMessage)

    @Before
    override fun setup() {
        repoContext = mock()
        featureDevService = mock()
        whenever(featureDevService.project).thenReturn(projectRule.project)
        sessionStateConfig = SessionStateConfig(testConversationId, repoContext, featureDevService)
        refinementState = RefinementState("", "tabId", sessionStateConfig, exampleCreateUploadUrlResponse.uploadId(), 0)
    }

    @Test
    fun `test refinement state with no userMssg`() {
        val actionNoMssg = SessionStateAction("test-task", "")
        assertThatThrownBy {
            runTest {
                refinementState.interact(actionNoMssg)
            }
        }.isInstanceOf(FeatureDevException::class.java).hasMessage(message("amazonqFeatureDev.exception.message_not_found"))
    }

    @Test
    fun `test refinement state with successful approach`() = runTest {
        whenever(
            featureDevService.generatePlan(testConversationId, exampleCreateUploadUrlResponse.uploadId(), userMessage, 0)
        ).thenReturn(exampleGenerateTaskAssistPlanResult)

        val actual = refinementState.interact(action)
        assertThat(actual.nextState).isInstanceOf(RefinementState::class.java)
        assertThat(actual.interaction.interactionSucceeded).isTrue()

        verify(featureDevService, times(1)).generatePlan(any(), any(), any(), any())
        assertThat(refinementState.phase).isEqualTo(SessionStatePhase.APPROACH)
        assertThat(refinementState.approach).isEqualTo(exampleGenerateTaskAssistPlanResult.approach)
    }

    @Test
    fun `test refinement state with failed approach`() = runTest {
        val generateTaskAssistPlanResult = GenerateTaskAssistPlanResult(approach = "There has been a problem generating approach", succeededPlanning = false)
        whenever(
            featureDevService.generatePlan(testConversationId, exampleCreateUploadUrlResponse.uploadId(), userMessage, 0)
        ).thenReturn(generateTaskAssistPlanResult)

        val actual = refinementState.interact(action)
        assertThat(actual.nextState).isInstanceOf(RefinementState::class.java)
        assertThat(actual.interaction.interactionSucceeded).isFalse()

        verify(featureDevService, times(1)).generatePlan(any(), any(), any(), any())
        assertThat(refinementState.phase).isEqualTo(SessionStatePhase.APPROACH)
        assertThat(refinementState.approach).isEqualTo(generateTaskAssistPlanResult.approach)
    }
}
