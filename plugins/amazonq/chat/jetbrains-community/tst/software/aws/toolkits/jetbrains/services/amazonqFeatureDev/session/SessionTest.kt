// Copyright 2024 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonqFeatureDev.session

import com.intellij.testFramework.RuleChain
import com.intellij.testFramework.replaceService
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
}
