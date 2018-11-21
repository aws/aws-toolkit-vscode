// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.applications

import com.intellij.testFramework.ProjectRule
import com.intellij.ui.JBColor
import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.whenever
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.cloudformation.model.StackStatus
import software.amazon.awssdk.services.lambda.LambdaClient
import software.amazon.awssdk.services.lambda.model.GetFunctionConfigurationRequest
import software.amazon.awssdk.services.lambda.model.GetFunctionConfigurationResponse
import software.amazon.awssdk.services.lambda.model.Runtime
import software.amazon.awssdk.services.lambda.model.TracingConfigResponse
import software.amazon.awssdk.services.lambda.model.TracingMode
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.services.lambda.LambdaFunctionNode
import software.aws.toolkits.jetbrains.utils.delegateMock

class ServerlessApplicationNodeTest {

    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val mockClientManager = MockClientManagerRule(projectRule)

    @Before
    fun setup() {
        val mock = mockClientManager.register(LambdaClient::class, delegateMock())
        whenever(mock.getFunctionConfiguration(any<GetFunctionConfigurationRequest>())).thenReturn(
            GetFunctionConfigurationResponse.builder()
                .runtime(Runtime.JAVA8)
                .functionName("blah")
                .functionArn("abc")
                .lastModified("132")
                .handler("hello")
                .timeout(1234)
                .memorySize(123)
                .tracingConfig(TracingConfigResponse.builder().mode(TracingMode.PASS_THROUGH).build())
                .role("abc")
                .build()
        )
    }

    @Test
    fun functionsGetMappedToFunctionNodes() {
        val sut = ServerlessApplicationNode(projectRule.project, "stack", StackStatus.CREATE_COMPLETE, listOf("function1", "function2"))

        assertThat(sut.children).hasOnlyElementsOfType(LambdaFunctionNode::class.java)
    }

    @Test
    fun failedStackShowRedAndNoChildren() {
        val sut = ServerlessApplicationNode(projectRule.project, "stack", StackStatus.CREATE_FAILED, listOf("function1"))

        assertThat(sut.presentation.forcedTextForeground).isEqualTo(JBColor.RED)
        assertThat(sut.children).isEmpty()
    }

    @Test
    fun inProgressStacksShowOrangeAndNoChildren() {
        val sut = ServerlessApplicationNode(projectRule.project, "stack", StackStatus.CREATE_IN_PROGRESS, listOf("function2"))

        assertThat(sut.presentation.forcedTextForeground).isEqualTo(JBColor.ORANGE)
        assertThat(sut.children).isEmpty()
    }
}