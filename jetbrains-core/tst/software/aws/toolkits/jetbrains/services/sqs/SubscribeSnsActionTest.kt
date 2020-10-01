// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.sqs

import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.TestActionEvent
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.sqs.SqsClient
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.services.sqs.actions.SubscribeSnsAction

class SubscribeSnsActionTest {
    lateinit var client: SqsClient

    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val mockClientManagerRule = MockClientManagerRule()

    @Before
    fun setup() {
        client = mockClientManagerRule.create()
    }

    @Test
    fun `Standard queue shows subscribe action`() {
        val mockNode = SqsQueueNode(projectRule.project, STANDARD_QUEUE_URL)
        val action = TestActionEvent()
        SubscribeSnsAction().update(mockNode, action)
        assertThat(action.presentation.isVisible).isTrue()
    }

    @Test
    fun `FIFO queue doesn't show subscribe action`() {
        val mockNode = SqsQueueNode(projectRule.project, FIFO_QUEUE_URL)
        val action = TestActionEvent()
        SubscribeSnsAction().update(mockNode, action)
        assertThat(action.presentation.isVisible).isFalse()
    }

    private companion object {
        const val STANDARD_QUEUE_URL = "https://sqs.us-east-1.amazonaws.com/123456789012/standard"
        const val FIFO_QUEUE_URL = "https://sqs.us-east-1.amazonaws.com/123456789012/fifo.fifo"
    }
}
