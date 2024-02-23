// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.apprunner.actions

import com.intellij.testFramework.ProjectRule
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.doAnswer
import org.mockito.kotlin.stub
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import software.amazon.awssdk.services.apprunner.AppRunnerClient
import software.amazon.awssdk.services.apprunner.model.DeleteServiceRequest
import software.amazon.awssdk.services.apprunner.model.DeleteServiceResponse
import software.amazon.awssdk.services.apprunner.model.ServiceSummary
import software.aws.toolkits.core.utils.test.aString
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.services.apprunner.AppRunnerServiceNode

class DeleteServiceActionTest {
    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val mockClientManagerRule = MockClientManagerRule()

    private val arn = aString()

    @Test
    fun `Delete service action calls delete`() {
        val action = DeleteServiceAction()
        val client: AppRunnerClient = mockClientManagerRule.create()
        client.stub {
            on { deleteService(any<DeleteServiceRequest>()) } doAnswer { DeleteServiceResponse.builder().build() }
        }
        val node = AppRunnerServiceNode(projectRule.project, ServiceSummary.builder().serviceName(aString()).serviceArn(arn).build())
        action.performDelete(node)
        verify(client, times(1)).deleteService(DeleteServiceRequest.builder().serviceArn(arn).build())
    }
}
