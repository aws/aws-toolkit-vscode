// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.lambda.applications

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
import software.amazon.awssdk.services.cloudformation.model.Stack
import software.amazon.awssdk.services.cloudformation.model.StackResource
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.explorer.AwsTruncatedResultNode
import software.aws.toolkits.jetbrains.utils.delegateMock

class ServerlessApplicationsNodeTest {

    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val mockClientManagerRule = MockClientManagerRule(projectRule)

    private val mockClient by lazy { mockClientManagerRule.register(CloudFormationClient::class, delegateMock()) }

    @Test
    fun onlyStacksThatContainLambdasAreShown() {
        mockClient.stacksWithNames(listOf("StackWithNoFunctions", "StackWithFunctions"))
        mockClient.stackWithResourcesOfType("StackWithNoFunctions", "AWS::S3::Bucket")
        mockClient.stackWithResourcesOfType("StackWithFunctions", "AWS::Lambda::Function", "AWS::S3::Bucket")

        val node = ServerlessApplicationsNode(projectRule.project)

        assertThat(node.children).hasOnlyOneElementSatisfying { assertThat(it.toString()).isEqualTo("StackWithFunctions") }
    }

    @Test
    fun truncatedNodeIsAddedForPaging() {
        mockClient.stacksWithNames(listOf("Stack1"), nextToken = "blah")
        mockClient.stackWithResourcesOfType("Stack1", "AWS::Lambda::Function", "AWS::S3::Bucket")
        val node = ServerlessApplicationsNode(projectRule.project)

        assertThat(node.children).hasSize(2).last().isInstanceOf(AwsTruncatedResultNode::class.java)
    }

    private fun CloudFormationClient.stacksWithNames(names: List<String>, nextToken: String? = null) {
        whenever(describeStacks(any<DescribeStacksRequest>()))
            .thenReturn(
                DescribeStacksResponse.builder().stacks(names.map { Stack.builder().stackName(it).build() }).nextToken(nextToken).build()
            )
    }

    private fun CloudFormationClient.stackWithResourcesOfType(stackName: String, vararg types: String) {
        whenever(describeStackResources(
                DescribeStackResourcesRequest.builder()
                    .stackName(stackName)
                    .build()
            )
        ).thenReturn(
            DescribeStackResourcesResponse.builder()
                .stackResources(types.map {
                    StackResource.builder()
                        .resourceType(it).build()
                }).build()
        )
    }
}