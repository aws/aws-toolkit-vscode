// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.apprunner.actions

import com.intellij.notification.Notification
import com.intellij.notification.Notifications
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.runInEdtAndWait
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runBlockingTest
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
import software.amazon.awssdk.services.apprunner.AppRunnerClient
import software.amazon.awssdk.services.apprunner.model.ServiceSummary
import software.amazon.awssdk.services.apprunner.model.StartDeploymentRequest
import software.amazon.awssdk.services.apprunner.model.StartDeploymentResponse
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.amazon.awssdk.services.cloudwatchlogs.model.DescribeLogStreamsRequest
import software.amazon.awssdk.services.cloudwatchlogs.model.DescribeLogStreamsResponse
import software.amazon.awssdk.services.cloudwatchlogs.model.LogStream
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.ToolWindowHeadlessManagerImpl
import software.aws.toolkits.jetbrains.core.toolwindow.ToolkitToolWindow
import software.aws.toolkits.jetbrains.services.apprunner.AppRunnerServiceNode
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.CloudWatchLogWindow
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.toolwindow.CloudWatchLogsToolWindowFactory
import software.aws.toolkits.jetbrains.utils.BaseCoroutineTest
import software.aws.toolkits.resources.message

@ExperimentalCoroutinesApi
class DeployActionTest : BaseCoroutineTest(30) {
    private val action = DeployAction()
    private lateinit var toolWindow: ToolkitToolWindow

    private lateinit var appRunnerClient: AppRunnerClient
    private lateinit var cloudwatchClient: CloudWatchLogsClient

    private val operationId = aString()

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    @Before
    fun setup() {
        (ToolWindowManager.getInstance(projectRule.project) as ToolWindowHeadlessManagerImpl)
            .doRegisterToolWindow(CloudWatchLogsToolWindowFactory.TOOLWINDOW_ID)

        toolWindow = CloudWatchLogWindow.getInstance(projectRule.project)
        appRunnerClient = mockClientManagerRule.create()
        cloudwatchClient = mockClientManagerRule.create()
    }

    @After
    fun cleanup() {
        // close tabs we created
        toolWindow.findPrefix("").forEach {
            runInEdtAndWait {
                it.dispose()
            }
        }
    }

    @Test
    fun `deploy fails`() {
        val notificationMock = mock<Notifications>()

        projectRule.project.messageBus.connect(disposableRule.disposable).subscribe(Notifications.TOPIC, notificationMock)

        appRunnerClient.stub {
            on { startDeployment(any<StartDeploymentRequest>()) } doAnswer { throw RuntimeException("Failed to start deployment") }
        }

        runBlockingTest {
            action.deploy(
                AppRunnerServiceNode(projectRule.project, ServiceSummary.builder().serviceName(aString()).serviceArn(aString()).build()),
                appRunnerClient,
                cloudwatchClient
            )
        }

        argumentCaptor<Notification>().apply {
            verify(notificationMock).notify(capture())

            assertThat(firstValue.content).contains(message("apprunner.action.deploy.failed"))
        }
    }

    @Test
    fun `deploy fails to open logs`() {
        val notificationMock = mock<Notifications>()

        projectRule.project.messageBus.connect(disposableRule.disposable).subscribe(Notifications.TOPIC, notificationMock)

        appRunnerClient.stub {
            on { startDeployment(any<StartDeploymentRequest>()) } doAnswer { StartDeploymentResponse.builder().operationId(operationId).build() }
        }

        cloudwatchClient.stub {
            on { describeLogStreams(any<DescribeLogStreamsRequest>()) } doAnswer { throw RuntimeException("broke") }
        }

        runBlockingTest {
            action.deploy(
                AppRunnerServiceNode(projectRule.project, ServiceSummary.builder().serviceName(aString()).serviceArn(aString()).build()),
                appRunnerClient,
                cloudwatchClient
            )
        }

        argumentCaptor<Notification>().apply {
            verify(notificationMock).notify(capture())

            assertThat(firstValue.content).contains(message("apprunner.action.deploy.unableToFindLogStream", "deployment/$operationId"))
        }
    }

    @Test
    fun `deploy succeeds and opens logs`() {
        appRunnerClient.stub {
            on { startDeployment(any<StartDeploymentRequest>()) } doAnswer { StartDeploymentResponse.builder().operationId(operationId).build() }
        }

        cloudwatchClient.stub {
            on { describeLogStreams(any<DescribeLogStreamsRequest>()) } doAnswer {
                DescribeLogStreamsResponse.builder().logStreams(LogStream.builder().logStreamName("deployment/$operationId").build()).build()
            }
        }

        runBlocking {
            action.deploy(
                AppRunnerServiceNode(projectRule.project, ServiceSummary.builder().serviceName(aString()).serviceArn(aString()).build()),
                appRunnerClient,
                cloudwatchClient
            )
        }

        runInEdtAndWait {
            val windows = toolWindow.findPrefix("")
            assertThat(windows.size).isEqualTo(1)
            assertThat(windows.first().displayName).isEqualTo(message("cloudwatch.logs.log_stream_title", "deployment/$operationId"))
        }
    }
}
