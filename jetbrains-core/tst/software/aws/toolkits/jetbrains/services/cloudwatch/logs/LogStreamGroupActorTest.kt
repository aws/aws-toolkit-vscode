// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs

import com.intellij.testFramework.ProjectRule
import com.intellij.ui.table.TableView
import com.intellij.util.ui.ListTableModel
import com.nhaarman.mockitokotlin2.whenever
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.channels.ClosedSendChannelException
import kotlinx.coroutines.debug.junit4.CoroutinesTimeout
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.TestCoroutineScope
import org.assertj.core.api.Assertions
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.mockito.Mockito
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.amazon.awssdk.services.cloudwatchlogs.model.DescribeLogStreamsRequest
import software.amazon.awssdk.services.cloudwatchlogs.model.DescribeLogStreamsResponse
import software.amazon.awssdk.services.cloudwatchlogs.model.LogStream
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.utils.waitForModelToBeAtLeast
import software.aws.toolkits.jetbrains.utils.waitForTrue
import software.aws.toolkits.resources.message

// ExperimentalCoroutinesApi is needed for TestCoroutineScope
@ExperimentalCoroutinesApi
class LogStreamGroupActorTest {
    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val mockClientManagerRule = MockClientManagerRule(projectRule)

    @JvmField
    @Rule
    val timeout = CoroutinesTimeout.seconds(15)

    private val testCoroutineScope: TestCoroutineScope = TestCoroutineScope()

    @After
    fun after() {
        testCoroutineScope.cleanupTestCoroutines()
    }

    @Test
    fun modelIsPopulated() {
        val client = mockClientManagerRule.create<CloudWatchLogsClient>()
        whenever(client.describeLogStreams(Mockito.any<DescribeLogStreamsRequest>()))
            .thenReturn(DescribeLogStreamsResponse.builder().logStreams(LogStream.builder().logStreamName("name").build()).build())
        val tableModel = ListTableModel<LogStream>()
        val table = TableView(tableModel)
        val coroutine = LogGroupActor(projectRule.project, client, table, "abc")
        runBlocking {
            coroutine.channel.send(LogActor.Message.LOAD_INITIAL())
            tableModel.waitForModelToBeAtLeast(1)
        }
        Assertions.assertThat(tableModel.items.size).isOne()
        Assertions.assertThat(tableModel.items.first().logStreamName()).isEqualTo("name")
    }

    @Test
    fun emptyTableOnExceptionThrown() {
        val client = mockClientManagerRule.create<CloudWatchLogsClient>()
        whenever(client.describeLogStreams(Mockito.any<DescribeLogStreamsRequest>())).then { throw IllegalStateException("network broke") }
        val tableModel = ListTableModel<LogStream>()
        val table = TableView(tableModel)
        val coroutine = LogGroupActor(projectRule.project, client, table, "abc")
        runBlocking {
            coroutine.channel.send(LogActor.Message.LOAD_INITIAL())
            waitForTrue { table.emptyText.text == message("cloudwatch.logs.failed_to_load_streams", "abc") }
        }
        Assertions.assertThat(tableModel.items).isEmpty()
    }

    @Test
    fun loadingForwardAppendsToTable() {
        val client = mockClientManagerRule.create<CloudWatchLogsClient>()
        whenever(client.describeLogStreams(Mockito.any<DescribeLogStreamsRequest>()))
            .thenReturn(DescribeLogStreamsResponse.builder().logStreams(LogStream.builder().logStreamName("name").build()).nextToken("1").build())
            .thenReturn(DescribeLogStreamsResponse.builder().logStreams(LogStream.builder().logStreamName("name2").build()).build())
        val tableModel = ListTableModel<LogStream>()
        val table = TableView(tableModel)
        val coroutine = LogGroupActor(projectRule.project, client, table, "abc")
        runBlocking {
            coroutine.channel.send(LogActor.Message.LOAD_INITIAL())
            coroutine.channel.send(LogActor.Message.LOAD_FORWARD())
            tableModel.waitForModelToBeAtLeast(2)
        }
        Assertions.assertThat(tableModel.items.size).isEqualTo(2)
        Assertions.assertThat(tableModel.items.first().logStreamName()).isEqualTo("name")
        Assertions.assertThat(tableModel.items[1].logStreamName()).isEqualTo("name2")
    }

    @Test
    fun writeChannelAndCoroutineIsDisposed() {
        val client = mockClientManagerRule.create<CloudWatchLogsClient>()
        val tableModel = ListTableModel<LogStream>()
        val table = TableView(tableModel)
        val coroutine = LogGroupActor(projectRule.project, client, table, "abc")
        val channel = coroutine.channel
        coroutine.dispose()
        Assertions.assertThatThrownBy {
            runBlocking {
                channel.send(LogActor.Message.LOAD_FORWARD())
            }
        }.isInstanceOf(ClosedSendChannelException::class.java)
    }
}
