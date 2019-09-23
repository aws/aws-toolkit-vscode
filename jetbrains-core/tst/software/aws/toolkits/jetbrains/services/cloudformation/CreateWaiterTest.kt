// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudformation

import com.intellij.testFramework.ProjectRule
import com.nhaarman.mockitokotlin2.argumentCaptor
import com.nhaarman.mockitokotlin2.times
import com.nhaarman.mockitokotlin2.verify
import com.nhaarman.mockitokotlin2.whenever
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.awscore.exception.AwsErrorDetails
import software.amazon.awssdk.services.cloudformation.CloudFormationClient
import software.amazon.awssdk.services.cloudformation.model.CloudFormationException
import software.amazon.awssdk.services.cloudformation.model.DescribeStacksRequest
import software.amazon.awssdk.services.cloudformation.model.DescribeStacksResponse
import software.amazon.awssdk.services.cloudformation.model.Stack
import software.amazon.awssdk.services.cloudformation.model.StackStatus
import software.aws.toolkits.core.utils.WaiterTimeoutException
import software.aws.toolkits.core.utils.WaiterUnrecoverableException
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import java.time.Duration

class CreateWaiterTest {
    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val mockClientManagerRule = MockClientManagerRule(projectRule)

    private val mockClient by lazy { mockClientManagerRule.create<CloudFormationClient>() }

    @Test
    fun createSuccessful() {
        val describeStacksRequest = argumentCaptor<DescribeStacksRequest>()

        mockClient.stackReturn("foo", 1, StackStatus.CREATE_COMPLETE)
        mockClient.waitForStackCreateComplete("foo", delay = DEFAULT_DELAY)

        verify(mockClient, times(2)).describeStacks(describeStacksRequest.capture())
        assertThat(describeStacksRequest.allValues).allSatisfy { assertThat(it.stackName()).isEqualTo("foo") }
    }

    @Test
    fun createFailedValidationError() {
        val describeStacksRequest = argumentCaptor<DescribeStacksRequest>()

        mockClient.stackThrowValidationError("foo", 1)
        assertThatThrownBy { mockClient.waitForStackCreateComplete("foo", delay = DEFAULT_DELAY) }
            .isInstanceOf(WaiterUnrecoverableException::class.java)
            .hasMessageContaining("validation error")

        verify(mockClient, times(2)).describeStacks(describeStacksRequest.capture())
        assertThat(describeStacksRequest.allValues).allSatisfy { assertThat(it.stackName()).isEqualTo("foo") }
    }

    @Test
    fun createFailedStatus() {
        assertFailureStatus("baz", 2, StackStatus.CREATE_FAILED)
    }

    @Test
    fun deleteCompleteStatus() {
        assertFailureStatus("foo", 1, StackStatus.DELETE_COMPLETE)
    }

    @Test
    fun deleteFailedStatus() {
        assertFailureStatus("foo", 1, StackStatus.DELETE_FAILED)
    }

    @Test
    fun updateRollbackCompleteStatus() {
        assertFailureStatus("foo", 1, StackStatus.ROLLBACK_COMPLETE)
    }

    @Test
    fun rollbackFailedStatus() {
        assertFailureStatus("bar", 0, StackStatus.ROLLBACK_FAILED)
    }

    @Test
    fun timeoutError() {
        mockClient.stackReturn("foo", 100000, StackStatus.CREATE_IN_PROGRESS)
        assertThatThrownBy {
            mockClient.waitForStackCreateComplete("foo", 1, delay = DEFAULT_DELAY)
        }.isInstanceOf(WaiterTimeoutException::class.java)
    }

    private fun assertFailureStatus(stackName: String, times: Int, failureStatus: StackStatus) {
        mockClient.stackReturn(stackName, times, failureStatus)
        val describeStacksRequest = argumentCaptor<DescribeStacksRequest>()
        assertThatThrownBy { mockClient.waitForStackCreateComplete(stackName, delay = DEFAULT_DELAY) }
            .isInstanceOf(WaiterUnrecoverableException::class.java)
            .hasMessageContaining(failureStatus.toString())
        verify(mockClient, times(times + 1)).describeStacks(describeStacksRequest.capture())
        assertThat(describeStacksRequest.allValues).allSatisfy { assertThat(it.stackName()).isEqualTo(stackName) }
    }

    private fun CloudFormationClient.stackReturn(stackName: String, times: Int, status: StackStatus) {
        val responses = mutableListOf<DescribeStacksResponse>()
        val inProgressResponseBuilder = DescribeStacksResponse.builder()
            .stacks(
                Stack.builder()
                    .stackName(stackName)
                    .stackStatus(StackStatus.CREATE_IN_PROGRESS)
                    .build()
            )

        val finalResponse = DescribeStacksResponse.builder()
            .stacks(
                Stack.builder()
                    .stackName(stackName)
                    .stackStatus(status)
                    .build()
            )
            .build()

        val firstResponse = if (times <= 0) finalResponse else inProgressResponseBuilder.build()

        if (times > 0) {
            repeat(times - 1) {
                responses.add(inProgressResponseBuilder.build())
            }
            responses.add(finalResponse)
        }

        whenever(
            describeStacks(
                DescribeStacksRequest.builder()
                    .stackName(stackName)
                    .build()
            )
        ).thenReturn(firstResponse, *responses.toTypedArray())
    }

    private fun CloudFormationClient.stackThrowValidationError(stackName: String, times: Int) {
        val responses = mutableListOf<DescribeStacksResponse>()
        val inProgressResponseBuilder = DescribeStacksResponse.builder()
            .stacks(
                Stack.builder()
                    .stackName(stackName)
                    .stackStatus(StackStatus.CREATE_IN_PROGRESS)
                    .build()
            )
        val finalResponse = CloudFormationException.builder()
            .awsErrorDetails(
                AwsErrorDetails.builder()
                    .errorCode("ValidationError")
                    .build()
            )
            .build()

        if (times <= 0) {
            whenever(
                describeStacks(
                    DescribeStacksRequest.builder()
                        .stackName(stackName)
                        .build()
                )
            ).thenThrow(finalResponse)
        } else {
            repeat(times - 1) {
                responses.add(inProgressResponseBuilder.build())
            }
            whenever(
                describeStacks(
                    DescribeStacksRequest.builder()
                        .stackName(stackName)
                        .build()
                )
            ).thenReturn(inProgressResponseBuilder.build(), *responses.toTypedArray())
                .thenThrow(finalResponse)
        }
    }

    companion object {
        private val DEFAULT_DELAY = Duration.ofMillis(5)
    }
}
