// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda

import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.lambda.model.FunctionConfiguration
import software.amazon.awssdk.services.lambda.model.Runtime
import software.amazon.awssdk.services.lambda.model.TracingConfigResponse
import software.amazon.awssdk.services.lambda.model.TracingMode
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerEmptyNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerErrorNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.LambdaExplorerRootNode
import software.aws.toolkits.jetbrains.services.lambda.resources.LambdaResources
import java.util.concurrent.CompletableFuture

class LambdaServiceNodeTest {

    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val resourceCache = MockResourceCacheRule()

    @Test
    fun lambdaFunctionsAreListed() {
        lambdaFunctions(listOf("bcd", "abc", "zzz", "AEF"))

        val children = LambdaServiceNode(projectRule.project, LAMBDA_EXPLORER_SERVICE_NODE).children

        assertThat(children).allMatch { it is LambdaFunctionNode }
        assertThat(children.filterIsInstance<LambdaFunctionNode>().map { it.functionName() }).containsExactlyInAnyOrder("abc", "AEF", "bcd", "zzz")
    }

    @Test
    fun noFunctionsShowsEmptyList() {
        lambdaFunctions(emptyList())

        val children = LambdaServiceNode(projectRule.project, LAMBDA_EXPLORER_SERVICE_NODE).children

        assertThat(children).hasSize(1)
        assertThat(children).allMatch { it is AwsExplorerEmptyNode }
    }

    @Test
    fun exceptionLeadsToErrorNode() {
        resourceCache.addEntry(
            projectRule.project,
            LambdaResources.LIST_FUNCTIONS,
            CompletableFuture<List<FunctionConfiguration>>().also {
                it.completeExceptionally(RuntimeException("Simulated error"))
            }
        )

        val children = LambdaServiceNode(projectRule.project, LAMBDA_EXPLORER_SERVICE_NODE).children

        assertThat(children).hasSize(1)
        assertThat(children).allMatch { it is AwsExplorerErrorNode }
    }

    private fun lambdaFunctions(names: List<String>) {
        resourceCache.addEntry(
            projectRule.project,
            LambdaResources.LIST_FUNCTIONS,
            CompletableFuture.completedFuture(names.map(::functionConfiguration))
        )
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

    private companion object {
        val LAMBDA_EXPLORER_SERVICE_NODE = LambdaExplorerRootNode()
    }
}
