// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs

import com.intellij.testFramework.ProjectRule
import com.nhaarman.mockitokotlin2.whenever
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import org.mockito.Mockito
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.amazon.awssdk.services.cloudwatchlogs.model.DescribeLogGroupsRequest
import software.amazon.awssdk.services.cloudwatchlogs.model.DescribeLogGroupsResponse
import software.amazon.awssdk.services.cloudwatchlogs.model.DescribeLogStreamsRequest
import software.amazon.awssdk.services.cloudwatchlogs.model.DescribeLogStreamsResponse
import software.amazon.awssdk.services.cloudwatchlogs.model.LogGroup
import software.amazon.awssdk.services.cloudwatchlogs.model.LogStream
import software.amazon.awssdk.services.cloudwatchlogs.model.ResourceNotFoundException
import software.aws.toolkits.jetbrains.core.MockClientManagerRule

class CloudWatchLogsTests {
    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val mockClientManagerRule = MockClientManagerRule(projectRule)

    @Test
    fun checkIfLogGroupExists() {
        val client = mockClientManagerRule.create<CloudWatchLogsClient>()
        whenever(client.describeLogGroups(Mockito.any<DescribeLogGroupsRequest>()))
            .thenReturn(
                DescribeLogGroupsResponse.builder().logGroups(LogGroup.builder().logGroupName("abcdefg").build()).build()
            )
        assertThat(client.checkIfLogGroupExists("abcdefg")).isTrue()
        assertThat(client.checkIfLogGroupExists("abc")).isFalse()
        assertThat(client.checkIfLogGroupExists("def")).isFalse()
    }

    @Test
    fun checkIfLogStreamExists() {
        val client = mockClientManagerRule.create<CloudWatchLogsClient>()
        whenever(client.describeLogStreams(Mockito.any<DescribeLogStreamsRequest>()))
            .thenReturn(
                DescribeLogStreamsResponse
                    .builder()
                    .logStreams(LogStream.builder().logStreamName("abcdefg").build())
                    .build()
            )
            .thenReturn(
                DescribeLogStreamsResponse
                    .builder()
                    .logStreams(LogStream.builder().logStreamName("abcdefg").build())
                    .build()
            )
            .thenThrow(ResourceNotFoundException.builder().build())
        assertThat(client.checkIfLogStreamExists("abcdefg", "abcdefg")).isTrue()
        assertThat(client.checkIfLogStreamExists("abcdefg", "abcd")).isFalse()
        assertThat(client.checkIfLogStreamExists("abcdefg", "notFOund")).isFalse()
    }
}
