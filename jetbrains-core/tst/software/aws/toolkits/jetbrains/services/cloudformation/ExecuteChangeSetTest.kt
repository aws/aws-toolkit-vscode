// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudformation

import com.intellij.testFramework.ProjectRule
import com.nhaarman.mockitokotlin2.any
import com.nhaarman.mockitokotlin2.argumentCaptor
import com.nhaarman.mockitokotlin2.stub
import com.nhaarman.mockitokotlin2.times
import com.nhaarman.mockitokotlin2.verify
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.awscore.exception.AwsErrorDetails
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.amazon.awssdk.services.cloudformation.model.CloudFormationException
import software.amazon.awssdk.services.cloudformation.model.DescribeStacksRequest
import software.amazon.awssdk.services.cloudformation.model.DescribeStacksResponse
import software.amazon.awssdk.services.cloudformation.model.ExecuteChangeSetRequest
import software.amazon.awssdk.services.cloudformation.model.ExecuteChangeSetResponse
import software.amazon.awssdk.services.cloudformation.model.Stack
import software.amazon.awssdk.services.cloudformation.model.StackStatus
import software.aws.toolkits.jetbrains.core.MockClientManagerRule

class ExecuteChangeSetTest {
    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val mockClientManagerRule = MockClientManagerRule(projectRule)

    private val mockClient by lazy { mockClientManagerRule.create<CloudFormationClient>() }

    @Test
    fun stackDoesNotExist() {
        val describeCaptor = argumentCaptor<DescribeStacksRequest>()
        val executeCaptor = argumentCaptor<ExecuteChangeSetRequest>()

        mockClient.stub {
            on { describeStacks(describeCaptor.capture()) }
                .thenThrow(
                    CloudFormationException.builder()
                        .awsErrorDetails(
                            AwsErrorDetails.builder()
                                .errorMessage("Stack with id foo does not exist")
                                .build()
                        ).build()
                )
                .thenReturn(describeResponse(StackStatus.CREATE_COMPLETE))

            on { executeChangeSet(executeCaptor.capture()) }.thenReturn(ExecuteChangeSetResponse.builder().build())
        }

        mockClient.executeChangeSetAndWait("foo", "changeBar")

        verify(mockClient, times(2)).describeStacks(any<DescribeStacksRequest>())
        verify(mockClient).executeChangeSet(any<ExecuteChangeSetRequest>())

        assertThat(describeCaptor.allValues).allSatisfy { assertThat(it.stackName()).isEqualTo("foo") }
        assertThat(executeCaptor.firstValue.stackName()).isEqualTo("foo")
        assertThat(executeCaptor.firstValue.changeSetName()).isEqualTo("changeBar")
    }

    @Test
    fun executeCreate() {
        val describeCaptor = argumentCaptor<DescribeStacksRequest>()
        val executeCaptor = argumentCaptor<ExecuteChangeSetRequest>()

        mockClient.stub {
            on { describeStacks(describeCaptor.capture()) }.thenReturn(
                describeResponse(StackStatus.REVIEW_IN_PROGRESS),
                describeResponse(StackStatus.CREATE_COMPLETE)
            )

            on { executeChangeSet(executeCaptor.capture()) }.thenReturn(ExecuteChangeSetResponse.builder().build())
        }

        mockClient.executeChangeSetAndWait("foo", "changeBar")

        verify(mockClient, times(2)).describeStacks(any<DescribeStacksRequest>())
        verify(mockClient).executeChangeSet(any<ExecuteChangeSetRequest>())

        assertThat(describeCaptor.allValues).allSatisfy { assertThat(it.stackName()).isEqualTo("foo") }
        assertThat(executeCaptor.firstValue.stackName()).isEqualTo("foo")
        assertThat(executeCaptor.firstValue.changeSetName()).isEqualTo("changeBar")
    }

    @Test
    fun executeUpdate() {
        val describeCaptor = argumentCaptor<DescribeStacksRequest>()
        val executeCaptor = argumentCaptor<ExecuteChangeSetRequest>()

        mockClient.stub {
            on { describeStacks(describeCaptor.capture()) }.thenReturn(
                describeResponse(StackStatus.CREATE_COMPLETE),
                describeResponse(StackStatus.UPDATE_COMPLETE)
            )

            on { executeChangeSet(executeCaptor.capture()) }.thenReturn(ExecuteChangeSetResponse.builder().build())
        }

        mockClient.executeChangeSetAndWait("foo", "changeBar")

        verify(mockClient, times(2)).describeStacks(any<DescribeStacksRequest>())
        verify(mockClient).executeChangeSet(any<ExecuteChangeSetRequest>())

        assertThat(describeCaptor.allValues).allSatisfy { assertThat(it.stackName()).isEqualTo("foo") }
        assertThat(executeCaptor.firstValue.stackName()).isEqualTo("foo")
        assertThat(executeCaptor.firstValue.changeSetName()).isEqualTo("changeBar")
    }

    private fun describeResponse(status: StackStatus) =
        DescribeStacksResponse.builder()
            .stacks(
                Stack.builder().stackName("foo")
                    .stackStatus(status)
                    .build()
            ).build()
}