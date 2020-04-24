// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs

import com.intellij.testFramework.ProjectRule
import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.verify
import com.nhaarman.mockitokotlin2.whenever
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.Mockito
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.amazon.awssdk.services.cloudwatchlogs.model.DeleteLogGroupRequest
import software.amazon.awssdk.services.cloudwatchlogs.model.DescribeLogStreamsRequest
import software.amazon.awssdk.services.cloudwatchlogs.model.DescribeLogStreamsResponse
import software.amazon.awssdk.services.cloudwatchlogs.model.LogGroup
import software.amazon.awssdk.services.cloudwatchlogs.model.LogStream
import software.aws.toolkits.core.utils.test.retryableAssert
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.toolwindow.ToolkitToolWindowManager
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions.DeleteGroupAction
import java.util.function.Consumer
import javax.swing.JPanel

class DeleteGroupActionTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val mockClientManager = MockClientManagerRule(projectRule)

    private val group = LogGroup.builder().logGroupName("name").build()
    private val stream = LogStream.builder().logStreamName("eman").build()
    private lateinit var cloudwatchmock: CloudWatchLogsClient

    @Before
    fun setupMocks() {
        cloudwatchmock = mockClientManager.create()
    }

    @Test
    fun deleteGroupSucceeds() {
        val mockNode = CloudWatchLogsNode(projectRule.project, "arn", "name")
        val delete = DeleteGroupAction()
        delete.performDelete(mockNode)
        verify(cloudwatchmock).deleteLogGroup(any<Consumer<DeleteLogGroupRequest.Builder>>())
    }

    @Test
    fun deleteGroupClosesWindow() {
        whenever(cloudwatchmock.describeLogStreams(Mockito.any<DescribeLogStreamsRequest>()))
            .thenReturn(DescribeLogStreamsResponse.builder().logStreams(stream).build())
        val mockNode = CloudWatchLogsNode(projectRule.project, "arn", "name")
        val toolWindowManager = ToolkitToolWindowManager.getInstance(projectRule.project, CloudWatchLogWindow.CW_LOGS_TOOL_WINDOW)
        toolWindowManager.addTab("test", JPanel(), true, "name")
        toolWindowManager.addTab("test", JPanel(), true, "name/eman")
        toolWindowManager.addTab("test", JPanel(), true, "name2")
        assertThat(toolWindowManager.findPrefix("name").size).isEqualTo(2)
        val delete = DeleteGroupAction()
        delete.performDelete(mockNode)
        // retryable because removing windows is done asynchronously
        retryableAssert {
            assertThat(toolWindowManager.find("name")).isNull()
            assertThat(toolWindowManager.find("name/eman")).isNull()
            assertThat(toolWindowManager.findPrefix("name2").size).isEqualTo(1)
        }
    }

    @Test(expected = RuntimeException::class)
    fun deleteGroupFails() {
        whenever(cloudwatchmock.deleteLogGroup(Mockito.any<DeleteLogGroupRequest>()))
            .thenThrow(RuntimeException("not found or whatever"))
        val mockNode = CloudWatchLogsNode(projectRule.project, "arn", "name")
        val delete = DeleteGroupAction()
        delete.performDelete(mockNode)
    }
}
