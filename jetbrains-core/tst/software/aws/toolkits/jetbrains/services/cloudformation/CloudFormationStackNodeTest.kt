// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudformation

import com.intellij.testFramework.ProjectRule
import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.whenever
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.amazon.awssdk.services.cloudformation.model.DescribeStackResourcesRequest
import software.amazon.awssdk.services.cloudformation.model.DescribeStackResourcesResponse
import software.amazon.awssdk.services.cloudformation.model.ResourceStatus
import software.amazon.awssdk.services.cloudformation.model.StackResource
import software.amazon.awssdk.services.cloudformation.model.StackStatus
import software.amazon.awssdk.services.lambda.LambdaClient
import software.amazon.awssdk.services.lambda.model.GetFunctionRequest
import software.amazon.awssdk.services.lambda.model.GetFunctionResponse
import software.amazon.awssdk.services.lambda.model.Runtime
import software.amazon.awssdk.services.lambda.model.TracingConfigResponse
import software.amazon.awssdk.services.lambda.model.TracingMode
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerEmptyNode
import software.aws.toolkits.jetbrains.services.lambda.LambdaFunctionNode
import software.aws.toolkits.jetbrains.utils.delegateMock

class CloudFormationStackNodeTest {

    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val mockClientManager = MockClientManagerRule(projectRule)

    private val mockCfnClient by lazy {
        mockClientManager.register(CloudFormationClient::class, delegateMock())
    }

    private val mockLambdaClient by lazy {
        mockClientManager.register(LambdaClient::class, delegateMock())
    }

    @Before
    fun setup() {
        whenever(mockCfnClient.describeStackResources(any<DescribeStackResourcesRequest>())).thenReturn(
            DescribeStackResourcesResponse.builder()
                .stackResources(
                    StackResource.builder().resourceType(LAMBDA_FUNCTION_TYPE).resourceStatus(ResourceStatus.CREATE_COMPLETE).logicalResourceId("processor").build(),
                    StackResource.builder().resourceType(LAMBDA_FUNCTION_TYPE).resourceStatus(ResourceStatus.CREATE_COMPLETE).logicalResourceId("processor2").build(),
                    StackResource.builder().resourceType("a dynamodb table").resourceStatus(ResourceStatus.CREATE_COMPLETE).build(),
                    StackResource.builder().resourceType("an IAM role").resourceStatus(ResourceStatus.CREATE_COMPLETE).build()
                )
                .build()
        )

        whenever(mockLambdaClient.getFunction(any<GetFunctionRequest>())).thenReturn(
            GetFunctionResponse.builder()
                .configuration {
                    it.functionName("Foo")
                    it.functionArn("arn:aws:lambda:us-west-2:0123456789:function:Foo")
                    it.lastModified("A ways back")
                    it.handler("blah:blah")
                    it.runtime(Runtime.JAVA8)
                    it.role("SomeRoleArn")
                    it.environment { env -> env.variables(emptyMap()) }
                    it.timeout(60)
                    it.memorySize(128)
                    it.tracingConfig(TracingConfigResponse.builder().mode(TracingMode.PASS_THROUGH).build())
                }
                .build()
        )
    }

    @Test
    fun nodeRefreshesHitCache() {
        val node = aCloudFormationStackNode(StackStatus.CREATE_COMPLETE)
        assertThat(node.isChildCacheInInitialState).isEqualTo(true)
        val children = node.children

        assertThat(node.isChildCacheInInitialState).isEqualTo(false)
        assertThat(children).hasSize(2)
        assertThat(children).hasOnlyElementsOfType(LambdaFunctionNode::class.java)
    }

    @Test
    fun failedStackHaveNoChildren() {
        val node = aCloudFormationStackNode(StackStatus.CREATE_FAILED)

        assertThat(node.children).isEmpty()
    }

    @Test
    fun failedStackHaveNoChildrenAfterRefresh() {
        val node = aCloudFormationStackNode(StackStatus.CREATE_FAILED)

        assertThat(node.children).isEmpty()
    }

    @Test
    fun inProgressStacksHaveNoChildren() {
        val node = aCloudFormationStackNode(StackStatus.CREATE_IN_PROGRESS)

        assertThat(node.children).isEmpty()
    }

    @Test
    fun inProgressStacksHaveNoChildrenAfterRefresh() {
        val node = aCloudFormationStackNode(StackStatus.CREATE_IN_PROGRESS)

        assertThat(node.children).isEmpty()
    }

    @Test
    fun stackOnlyContainingDeletedResourceHasPlaceholderChild() {
        whenever(mockCfnClient.describeStackResources(any<DescribeStackResourcesRequest>())).thenReturn(
            DescribeStackResourcesResponse.builder()
                .stackResources(
                    StackResource.builder().resourceType(LAMBDA_FUNCTION_TYPE).resourceStatus(ResourceStatus.DELETE_COMPLETE).logicalResourceId("processor").build(),
                    StackResource.builder().resourceType(LAMBDA_FUNCTION_TYPE).resourceStatus(ResourceStatus.DELETE_COMPLETE).logicalResourceId("processor2").build()
                )
                .build()
        )

        val node = aCloudFormationStackNode(StackStatus.CREATE_COMPLETE)

        assertThat(node.children).hasSize(1)
        assertThat(node.children).hasOnlyElementsOfType(AwsExplorerEmptyNode::class.java)
    }

    private fun aCloudFormationStackNode(status: StackStatus) = CloudFormationStackNode(projectRule.project, "stack", status, "stackId")
}