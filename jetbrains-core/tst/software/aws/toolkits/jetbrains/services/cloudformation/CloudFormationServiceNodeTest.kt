// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudformation

import com.intellij.testFramework.ProjectRule
import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.whenever
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.amazon.awssdk.services.cloudformation.model.DescribeStackResourcesRequest
import software.amazon.awssdk.services.cloudformation.model.DescribeStackResourcesResponse
import software.amazon.awssdk.services.cloudformation.model.DescribeStacksRequest
import software.amazon.awssdk.services.cloudformation.model.DescribeStacksResponse
import software.amazon.awssdk.services.cloudformation.model.ResourceStatus
import software.amazon.awssdk.services.cloudformation.model.Stack
import software.amazon.awssdk.services.cloudformation.model.StackResource
import software.amazon.awssdk.services.cloudformation.model.StackStatus
import software.amazon.awssdk.services.lambda.LambdaClient
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerEmptyNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsTruncatedResultNode
import software.aws.toolkits.jetbrains.utils.delegateMock

class CloudFormationServiceNodeTest {

    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val mockClientManagerRule = MockClientManagerRule(projectRule)

    private val mockClient by lazy {
        mockClientManagerRule.register(LambdaClient::class, delegateMock())
        mockClientManagerRule.register(CloudFormationClient::class, delegateMock())
    }

    @Test
    fun completedStacksThatContainActiveLambdas_Shown() {
        mockClient.stacksWithNames(listOf("Stack" to StackStatus.CREATE_COMPLETE))
        mockClient.stackWithResourcesOfType("Stack", "AWS::Lambda::Function" to ResourceStatus.CREATE_COMPLETE)

        val node = CloudFormationServiceNode(projectRule.project)

        assertThat(node.children).hasOnlyOneElementSatisfying { assertThat(it.displayName()).isEqualTo("Stack") }
    }

    @Test
    fun deletedStacksThatContainActiveLambdas_NotShown() {
        mockClient.stacksWithNames(listOf("Stack" to StackStatus.DELETE_COMPLETE))
        mockClient.stackWithResourcesOfType("Stack", "AWS::Lambda::Function" to ResourceStatus.CREATE_COMPLETE)

        val node = CloudFormationServiceNode(projectRule.project)

        assertThat(node.children).hasOnlyElementsOfType(AwsExplorerEmptyNode::class.java)
    }

    @Test
    fun completedStacksThatOnlyContainDeletedLambdas_DoShow() {
        mockClient.stacksWithNames(listOf("Stack" to StackStatus.CREATE_COMPLETE))
        mockClient.stackWithResourcesOfType("Stack", "AWS::Lambda::Function" to ResourceStatus.DELETE_COMPLETE)

        val node = CloudFormationServiceNode(projectRule.project)

        assertThat(node.children).hasSize(1)
        assertThat(node.children).hasOnlyElementsOfType(CloudFormationStackNode::class.java)
    }

    @Test
    fun completedStacksThatDoNotContainLambdas_Shown() {
        mockClient.stacksWithNames(listOf("Stack" to StackStatus.CREATE_COMPLETE))
        mockClient.stackWithResourcesOfType("Stack", "AWS::S3::Bucket" to ResourceStatus.CREATE_COMPLETE)

        val node = CloudFormationServiceNode(projectRule.project)

        assertThat(node.children).hasSize(1)
        assertThat(node.children).hasOnlyElementsOfType(CloudFormationStackNode::class.java)
    }

    @Test
    fun truncatedNodeIsAddedForPaging() {
        mockClient.stacksWithNames(listOf("Stack1" to StackStatus.CREATE_COMPLETE), nextToken = "blah")
        mockClient.stackWithResourcesOfType("Stack1", "AWS::Lambda::Function" to ResourceStatus.CREATE_COMPLETE)
        val node = CloudFormationServiceNode(projectRule.project)

        assertThat(node.children).hasSize(2).last().isInstanceOf(AwsTruncatedResultNode::class.java)
    }

    private fun CloudFormationClient.stacksWithNames(names: List<Pair<String, StackStatus>>, nextToken: String? = null) {
        whenever(describeStacks(any<DescribeStacksRequest>()))
            .thenReturn(
                DescribeStacksResponse.builder().stacks(names.map {
                    Stack.builder().stackName(it.first).stackId(it.first).stackStatus(it.second).build()
                }).nextToken(nextToken).build()
            )
    }

    private fun CloudFormationClient.stackWithResourcesOfType(stackName: String, vararg types: Pair<String, ResourceStatus>) {
        whenever(describeStackResources(
            DescribeStackResourcesRequest.builder()
                .stackName(stackName)
                .build()
        )
        ).thenReturn(
            DescribeStackResourcesResponse.builder()
                .stackResources(types.map {
                    StackResource.builder()
                        .physicalResourceId(it.first)
                        .resourceType(it.first)
                        .resourceStatus(it.second).build()
                }).build()
        )
    }
}