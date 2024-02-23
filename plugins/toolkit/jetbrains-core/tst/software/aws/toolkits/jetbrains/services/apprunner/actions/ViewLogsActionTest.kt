// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.apprunner.actions

import com.intellij.notification.Notification
import com.intellij.notification.Notifications
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.doAnswer
import org.mockito.kotlin.mock
import org.mockito.kotlin.stub
import org.mockito.kotlin.verify
import software.amazon.awssdk.services.apprunner.model.ServiceSummary
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.amazon.awssdk.services.cloudwatchlogs.model.DescribeLogGroupsRequest
import software.amazon.awssdk.services.cloudwatchlogs.model.DescribeLogGroupsResponse
import software.amazon.awssdk.services.cloudwatchlogs.model.LogGroup
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.ToolWindowHeadlessManagerImpl
import software.aws.toolkits.jetbrains.core.toolwindow.ToolkitToolWindow
import software.aws.toolkits.jetbrains.services.apprunner.AppRunnerServiceNode
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.CloudWatchLogWindow
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.toolwindow.CloudWatchLogsToolWindowFactory
import software.aws.toolkits.resources.message

class ViewLogsActionTest {
    @Rule
    @JvmField
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    @JvmField
    @Rule
    val mockClientManagerRule = MockClientManagerRule()

    private lateinit var node: AppRunnerServiceNode
    private lateinit var toolWindow: ToolkitToolWindow

    @Before
    fun setup() {
        (ToolWindowManager.getInstance(projectRule.project) as ToolWindowHeadlessManagerImpl)
            .doRegisterToolWindow(CloudWatchLogsToolWindowFactory.TOOLWINDOW_ID)
        toolWindow = CloudWatchLogWindow.getInstance(projectRule.project)
        node = AppRunnerServiceNode(projectRule.project, ServiceSummary.builder().serviceName(aString()).serviceId(aString()).build())
    }

    @After
    fun cleanup() {
        // close tabs we created
        runInEdtAndWait {
            toolWindow.findPrefix("").forEach {
                toolWindow.removeContent(it)
            }
        }
    }

    @Test
    fun `Shows log group`() {
        val client: CloudWatchLogsClient = mockClientManagerRule.create()
        val logGroupName = "/aws/apprunner/${node.service.serviceName()}/${node.service.serviceId()}/service"
        client.stub {
            on { describeLogGroups(any<DescribeLogGroupsRequest>()) } doAnswer {
                DescribeLogGroupsResponse.builder().logGroups(LogGroup.builder().logGroupName(logGroupName).build()).build()
            }
        }

        val windows = runInEdtAndGet {
            viewLogGroup(node, "service")
            toolWindow.findPrefix("")
        }

        assertThat(windows.size).isEqualTo(1)
        assertThat(windows.first().displayName).isEqualTo(message("cloudwatch.logs.log_group_title", "service"))
    }

    @Test
    fun `Shows error when exception is thrown`() {
        val notificationMock = mock<Notifications>()
        mockClientManagerRule.create<CloudWatchLogsClient>()

        projectRule.project.messageBus.connect(disposableRule.disposable).subscribe(Notifications.TOPIC, notificationMock)

        viewLogGroup(node, "service")

        argumentCaptor<Notification>().apply {
            verify(notificationMock).notify(capture())

            assertThat(firstValue.content).contains(message("apprunner.view_service_log_streams.error", ""))
        }
    }

    @Test
    fun `Shows error when log group doesn't exist yet`() {
        val notificationMock = mock<Notifications>()
        mockClientManagerRule.create<CloudWatchLogsClient>()

        projectRule.project.messageBus.connect(disposableRule.disposable).subscribe(Notifications.TOPIC, notificationMock)

        val client: CloudWatchLogsClient = mockClientManagerRule.create()
        client.stub {
            on { describeLogGroups(any<DescribeLogGroupsRequest>()) } doAnswer {
                DescribeLogGroupsResponse.builder().logGroups(listOf()).build()
            }
        }

        viewLogGroup(node, "service")

        argumentCaptor<Notification>().apply {
            verify(notificationMock).notify(capture())

            assertThat(firstValue.content).contains(message("apprunner.view_service_log_streams.error_not_created"))
        }
    }
}
