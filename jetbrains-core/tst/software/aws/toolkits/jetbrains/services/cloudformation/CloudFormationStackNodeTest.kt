// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudformation

import com.intellij.testFramework.ProjectRule
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.cloudformation.model.ResourceStatus
import software.amazon.awssdk.services.cloudformation.model.StackResourceSummary
import software.amazon.awssdk.services.cloudformation.model.StackStatus
import software.amazon.awssdk.services.lambda.model.FunctionConfiguration
import software.amazon.awssdk.services.lambda.model.Runtime
import software.amazon.awssdk.services.lambda.model.TracingConfigResponse
import software.amazon.awssdk.services.lambda.model.TracingMode
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.MockResourceCache
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerEmptyNode
import software.aws.toolkits.jetbrains.services.cloudformation.resources.CloudFormationResources
import software.aws.toolkits.jetbrains.services.lambda.LambdaFunctionNode
import software.aws.toolkits.jetbrains.services.lambda.resources.LambdaResources
import java.util.concurrent.CompletableFuture

class CloudFormationStackNodeTest {

    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val mockClientManager = MockClientManagerRule(projectRule)

    @Before
    fun setUp() {
        resourceCache().clear()
    }

    @Test
    fun failedStackHaveNoChildren() {
        val node = aCloudFormationStackNode(StackStatus.CREATE_FAILED)

        assertThat(node.children).isEmpty()
    }

    @Test
    fun inProgressStacksHaveNoChildren() {
        val node = aCloudFormationStackNode(StackStatus.CREATE_IN_PROGRESS)

        assertThat(node.children).isEmpty()
    }

    @Test
    fun deletedAndFailedResourcesAreNotShown() {
        val node = aCloudFormationStackNode(StackStatus.CREATE_COMPLETE)

        resourceCache().stackWithResources(
            node.stackId,
            listOf(
                Triple("processor", LAMBDA_FUNCTION_TYPE, ResourceStatus.DELETE_COMPLETE),
                Triple("processor2", LAMBDA_FUNCTION_TYPE, ResourceStatus.CREATE_FAILED)
            )
        )

        assertThat(node.children).hasSize(1)
        assertThat(node.children).hasOnlyElementsOfType(AwsExplorerEmptyNode::class.java)
    }

    @Test
    fun completedSupportedResourcesAreShown() {
        val node = aCloudFormationStackNode(StackStatus.CREATE_COMPLETE)

        resourceCache().stackWithResources(
            node.stackId,
            listOf(
                Triple("processor", LAMBDA_FUNCTION_TYPE, ResourceStatus.CREATE_COMPLETE),
                Triple("role", "AWS::IAM::Role", ResourceStatus.CREATE_COMPLETE)
            )
        )

        resourceCache().lambdaFunction(
            FunctionConfiguration.builder()
                .functionName("processor")
                .functionArn("arn:aws:lambda:us-west-2:0123456789:function:processor")
                .lastModified("A ways back")
                .handler("blah:blah")
                .runtime(Runtime.JAVA8)
                .role("SomeRoleArn")
                .environment { it.variables(emptyMap()) }
                .timeout(60)
                .memorySize(128)
                .tracingConfig(TracingConfigResponse.builder().mode(TracingMode.PASS_THROUGH).build())
                .build()
        )

        assertThat(node.children).hasSize(1)
        assertThat(node.children).hasOnlyElementsOfType(LambdaFunctionNode::class.java)
    }

    private fun aCloudFormationStackNode(status: StackStatus) = CloudFormationStackNode(projectRule.project, "stack", status, "stackId")

    private fun resourceCache() = MockResourceCache.getInstance(projectRule.project)

    private fun MockResourceCache.stackWithResources(stackName: String, resources: List<Triple<String, String, ResourceStatus>>) {
        this.addEntry(
            CloudFormationResources.listStackResources(stackName),
            CompletableFuture.completedFuture(
                resources.map {
                    StackResourceSummary.builder()
                        .logicalResourceId(it.first)
                        .physicalResourceId("arn:aws:lambda:us-west-2:0123456789:function:${it.first}")
                        .resourceType(it.second)
                        .resourceStatus(it.third)
                        .build()
                }
            ))
    }

    private fun MockResourceCache.lambdaFunction(functionConfiguration: FunctionConfiguration) {
        this.addEntry(
            LambdaResources.LIST_FUNCTIONS,
            CompletableFuture.completedFuture(listOf(functionConfiguration)))
    }
}