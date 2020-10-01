// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.sqs

import com.intellij.testFramework.ProjectRule
import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.verify
import com.nhaarman.mockitokotlin2.whenever
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.Mockito
import software.amazon.awssdk.services.sqs.SqsClient
import software.amazon.awssdk.services.sqs.model.DeleteQueueRequest
import software.aws.toolkits.core.utils.test.retryableAssert
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.toolwindow.ToolkitToolWindowManager
import software.aws.toolkits.jetbrains.services.sqs.actions.DeleteQueueAction
import software.aws.toolkits.jetbrains.services.sqs.toolwindow.SqsWindow
import java.util.function.Consumer
import javax.swing.JPanel

class DeleteQueueActionTest {
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
    fun `Delete queue succeeds`() {
        val mockNode = SqsQueueNode(projectRule.project, QUEUE_URL)
        DeleteQueueAction().performDelete(mockNode)
        verify(client).deleteQueue(any<Consumer<DeleteQueueRequest.Builder>>())
    }

    @Test
    fun `Delete queue closes tool window`() {
        val mockNode = SqsQueueNode(projectRule.project, QUEUE_URL)
        val toolWindowManager = ToolkitToolWindowManager.getInstance(projectRule.project, SqsWindow.SQS_TOOL_WINDOW).apply {
            addTab("test1", JPanel(), activate = true, id = QUEUE_URL)
        }
        DeleteQueueAction().performDelete(mockNode)
        retryableAssert {
            assertThat(toolWindowManager.find(QUEUE_URL)).isNull()
        }
    }

    @Test
    fun `Delete queue returns error`() {
        whenever(client.deleteQueue(Mockito.any<DeleteQueueRequest>())).thenThrow(RuntimeException(ERROR_MESSAGE))
        val mockNode = SqsQueueNode(projectRule.project, QUEUE_URL)
        assertThatThrownBy { DeleteQueueAction().performDelete(mockNode) }.hasMessage(ERROR_MESSAGE)
    }

    private companion object {
        const val QUEUE_URL = "https://sqs.us-east-1.amazonaws.com/123456789012/test1"
        const val ERROR_MESSAGE = "Network Error"
    }
}
