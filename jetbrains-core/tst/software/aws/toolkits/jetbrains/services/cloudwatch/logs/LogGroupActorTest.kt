// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs

import com.intellij.ui.table.TableView
import com.intellij.util.ui.ListTableModel
import com.nhaarman.mockitokotlin2.whenever
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.channels.ClosedSendChannelException
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions
import org.junit.Before
import org.junit.Test
import org.mockito.Mockito
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.amazon.awssdk.services.cloudwatchlogs.model.DescribeLogStreamsRequest
import software.amazon.awssdk.services.cloudwatchlogs.model.DescribeLogStreamsResponse
import software.amazon.awssdk.services.cloudwatchlogs.model.LogStream
import software.aws.toolkits.jetbrains.utils.BaseCoroutineTest
import software.aws.toolkits.jetbrains.utils.waitForModelToBeAtLeast
import software.aws.toolkits.jetbrains.utils.waitForTrue
import software.aws.toolkits.resources.message

@ExperimentalCoroutinesApi
class LogGroupActorTest : BaseCoroutineTest() {
    private lateinit var client: CloudWatchLogsClient
    private lateinit var tableModel: ListTableModel<LogStream>
    private lateinit var table: TableView<LogStream>
    private lateinit var actor: LogActor<LogStream>

    @Before
    fun loadVariables() {
        client = mockClientManagerRule.create()
        tableModel = ListTableModel<LogStream>()
        table = TableView(tableModel)
        actor = LogGroupActor(projectRule.project, client, table, "abc")
    }

    @Test
    fun modelIsPopulated() {
        whenever(client.describeLogStreams(Mockito.any<DescribeLogStreamsRequest>()))
            .thenReturn(DescribeLogStreamsResponse.builder().logStreams(LogStream.builder().logStreamName("name").build()).build())
        runBlocking {
            actor.channel.send(LogActor.Message.LoadInitial)
            tableModel.waitForModelToBeAtLeast(1)
        }
        Assertions.assertThat(tableModel.items.size).isOne()
        Assertions.assertThat(tableModel.items.first().logStreamName()).isEqualTo("name")
    }

    @Test
    fun emptyTableOnExceptionThrown() {
        whenever(client.describeLogStreams(Mockito.any<DescribeLogStreamsRequest>())).then { throw IllegalStateException("network broke") }
        runBlocking {
            actor.channel.send(LogActor.Message.LoadInitial)
            waitForTrue { table.emptyText.text == message("cloudwatch.logs.failed_to_load_streams", "abc") }
        }
        Assertions.assertThat(tableModel.items).isEmpty()
    }

    @Test
    fun loadingForwardAppendsToTable() {
        whenever(client.describeLogStreams(Mockito.any<DescribeLogStreamsRequest>()))
            .thenReturn(DescribeLogStreamsResponse.builder().logStreams(LogStream.builder().logStreamName("name").build()).nextToken("1").build())
            .thenReturn(DescribeLogStreamsResponse.builder().logStreams(LogStream.builder().logStreamName("name2").build()).build())
        runBlocking {
            actor.channel.send(LogActor.Message.LoadInitial)
            actor.channel.send(LogActor.Message.LoadForward)
            tableModel.waitForModelToBeAtLeast(2)
        }
        Assertions.assertThat(tableModel.items.size).isEqualTo(2)
        Assertions.assertThat(tableModel.items.first().logStreamName()).isEqualTo("name")
        Assertions.assertThat(tableModel.items[1].logStreamName()).isEqualTo("name2")
    }

    @Test
    fun writeChannelAndCoroutineIsDisposed() {
        val channel = actor.channel
        actor.dispose()
        Assertions.assertThatThrownBy {
            runBlocking {
                channel.send(LogActor.Message.LoadForward)
            }
        }.isInstanceOf(ClosedSendChannelException::class.java)
    }
}
