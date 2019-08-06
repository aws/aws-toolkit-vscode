// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.testFramework.ProjectRule
import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.whenever
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.lambda.LambdaClient
import software.amazon.awssdk.services.lambda.model.FunctionConfiguration
import software.amazon.awssdk.services.lambda.model.ListFunctionsRequest
import software.amazon.awssdk.services.lambda.model.ListFunctionsResponse
import software.amazon.awssdk.services.lambda.model.Runtime
import software.amazon.awssdk.services.lambda.model.TracingConfigResponse
import software.amazon.awssdk.services.lambda.model.TracingMode
import software.aws.toolkits.jetbrains.core.MockClientManagerRule

class LambdaServiceNodeTest {

    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val mockClientManagerRule = MockClientManagerRule(projectRule)

    private val mockClient by lazy { mockClientManagerRule.create<LambdaClient>() }

    @Test
    fun lambdaFunctionsAreSortedAlphabetically() {
        whenever(mockClient.listFunctions(any<ListFunctionsRequest>())).thenReturn(ListFunctionsResponse.builder().apply {
            this.functions(functionConfiguration("bcd"),
                functionConfiguration("abc"),
                functionConfiguration("zzz"),
                functionConfiguration("AEF"))
        }.build())

        val children = LambdaServiceNode(projectRule.project).children

        assertThat(children).allMatch { it is LambdaFunctionNode }
        assertThat(children.filterIsInstance<LambdaFunctionNode>().map { it.functionName() }).containsExactly("abc", "AEF", "bcd", "zzz")
    }

    private fun functionConfiguration(functionName: String) =
        FunctionConfiguration.builder()
            .functionName(functionName)
            .functionArn("arn:aws:lambda:us-west-2:0123456789:function:$functionName")
            .lastModified("A ways back")
            .handler("blah:blah")
            .runtime(Runtime.JAVA8)
            .role("SomeRoleArn")
            .environment { it.variables(emptyMap()) }
            .timeout(60)
            .memorySize(128)
            .tracingConfig(TracingConfigResponse.builder().mode(TracingMode.PASS_THROUGH).build())
            .build()
}