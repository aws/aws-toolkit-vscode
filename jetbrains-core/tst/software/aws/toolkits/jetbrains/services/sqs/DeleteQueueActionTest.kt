// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.sqs

import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.replaceService
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.Mockito
import org.mockito.kotlin.any
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.mock
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import software.amazon.awssdk.services.sqs.SqsClient
import software.amazon.awssdk.services.sqs.model.DeleteQueueRequest
import software.aws.toolkits.core.region.anAwsRegion
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.MockToolWindow
import software.aws.toolkits.jetbrains.services.sqs.actions.DeleteQueueAction
import software.aws.toolkits.jetbrains.services.sqs.toolwindow.SqsWindow
import java.util.function.Consumer

class DeleteQueueActionTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val mockClientManagerRule = MockClientManagerRule()

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    private lateinit var client: SqsClient

    @Before
    fun setup() {
        client = mockClientManagerRule.create()

        val mockToolWindow = MockToolWindow(projectRule.project)
        val mockToolWindowManager = mock<ToolWindowManager> {
            on { getToolWindow(any()) } doReturn mockToolWindow
        }
        projectRule.project.replaceService(ToolWindowManager::class.java, mockToolWindowManager, disposableRule.disposable)
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
        runInEdtAndWait {
            SqsWindow.getInstance(projectRule.project).pollMessage(Queue(QUEUE_URL, anAwsRegion()))
        }
        DeleteQueueAction().performDelete(mockNode)
        runInEdtAndWait {
            assertThat(SqsWindow.getInstance(projectRule.project).findQueue(QUEUE_URL)).isNull()
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
