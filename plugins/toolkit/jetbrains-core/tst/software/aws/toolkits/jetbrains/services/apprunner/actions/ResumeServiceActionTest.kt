// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.apprunner.actions

import com.intellij.notification.Notification
import com.intellij.notification.Notifications
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.ProjectRule
import com.intellij.testFramework.TestActionEvent
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.doAnswer
import org.mockito.kotlin.mock
import org.mockito.kotlin.stub
import org.mockito.kotlin.verify
import software.amazon.awssdk.awscore.exception.AwsErrorDetails
import software.amazon.awssdk.services.apprunner.AppRunnerClient
import software.amazon.awssdk.services.apprunner.model.AppRunnerException
import software.amazon.awssdk.services.apprunner.model.ResumeServiceRequest
import software.amazon.awssdk.services.apprunner.model.ResumeServiceResponse
import software.amazon.awssdk.services.apprunner.model.ServiceStatus
import software.amazon.awssdk.services.apprunner.model.ServiceSummary
import software.aws.toolkits.core.utils.RuleUtils
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.services.apprunner.AppRunnerServiceNode
import software.aws.toolkits.resources.message

class ResumeServiceActionTest {
    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    @JvmField
    @Rule
    val mockClientManagerRule = MockClientManagerRule()

    private val action = ResumeServiceAction()
    private lateinit var appRunnerClient: AppRunnerClient

    private val serviceName = RuleUtils.randomName()
    private val serviceArn = "arn::$serviceName"
    private val serviceSummary = ServiceSummary.builder().serviceName(serviceName).serviceArn(serviceArn).build()

    @Before
    fun setup() {
        appRunnerClient = mockClientManagerRule.create()
    }

    @Test
    fun `Resume fails`() {
        val notificationMock = mock<Notifications>()

        projectRule.project.messageBus.connect(disposableRule.disposable).subscribe(Notifications.TOPIC, notificationMock)

        appRunnerClient.stub {
            on { resumeService(any<ResumeServiceRequest>()) } doAnswer { throw RuntimeException("Failed to resume!") }
        }

        action.performResume(projectRule.project, appRunnerClient, serviceSummary)

        argumentCaptor<Notification>().apply {
            verify(notificationMock).notify(capture())

            assertThat(firstValue.content).contains(message("apprunner.resume.failed", serviceName, ""))
        }
    }

    @Test
    fun `Resume fails not paused`() {
        val message = RuleUtils.randomName()
        val notificationMock = mock<Notifications>()

        projectRule.project.messageBus.connect(disposableRule.disposable).subscribe(Notifications.TOPIC, notificationMock)

        appRunnerClient.stub {
            on { resumeService(any<ResumeServiceRequest>()) } doAnswer {
                throw AppRunnerException.builder().awsErrorDetails(AwsErrorDetails.builder().errorMessage(message).build()).build()
            }
        }

        action.performResume(projectRule.project, appRunnerClient, serviceSummary)

        argumentCaptor<Notification>().apply {
            verify(notificationMock).notify(capture())

            assertThat(firstValue.content).contains(message("apprunner.resume.failed", serviceName, message))
        }
    }

    @Test
    fun `Resume succeeds`() {
        val notificationMock = mock<Notifications>()

        projectRule.project.messageBus.connect(disposableRule.disposable).subscribe(Notifications.TOPIC, notificationMock)

        appRunnerClient.stub {
            on { resumeService(any<ResumeServiceRequest>()) } doAnswer { ResumeServiceResponse.builder().build() }
        }

        action.performResume(projectRule.project, appRunnerClient, serviceSummary)

        argumentCaptor<Notification>().apply {
            verify(notificationMock).notify(capture())

            assertThat(firstValue.content).contains(message("apprunner.resume.succeeded", serviceName))
        }
    }

    @Test
    fun `Hides node if service is not paused`() {
        ServiceStatus.knownValues().filter { it != ServiceStatus.PAUSED }.forEach {
            val actionEvent = TestActionEvent()
            action.update(AppRunnerServiceNode(projectRule.project, ServiceSummary.builder().serviceName(serviceName).status(it).build()), actionEvent)
            assertThat(actionEvent.presentation.isVisible).isFalse
        }
    }

    @Test
    fun `Shows node if service is paused`() {
        val actionEvent = TestActionEvent()
        action.update(
            AppRunnerServiceNode(projectRule.project, ServiceSummary.builder().serviceName(serviceName).status(ServiceStatus.PAUSED).build()),
            actionEvent
        )
        assertThat(actionEvent.presentation.isVisible).isTrue
    }
}
