// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs

import com.intellij.ui.table.TableView
import com.intellij.util.ui.ListTableModel
import com.nhaarman.mockitokotlin2.whenever
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.channels.ClosedSendChannelException
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Before
import org.junit.Test
import org.mockito.Mockito
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.amazon.awssdk.services.cloudwatchlogs.model.GetLogEventsRequest
import software.amazon.awssdk.services.cloudwatchlogs.model.GetLogEventsResponse
import software.amazon.awssdk.services.cloudwatchlogs.model.OutputLogEvent
import software.amazon.awssdk.services.cloudwatchlogs.paginators.GetLogEventsIterable
import software.aws.toolkits.jetbrains.utils.BaseCoroutineTest
import software.aws.toolkits.jetbrains.utils.waitForModelToBeAtLeast
import software.aws.toolkits.jetbrains.utils.waitForTrue
import software.aws.toolkits.resources.message
import java.time.Duration

@ExperimentalCoroutinesApi
class LogStreamListActorTest : BaseCoroutineTest() {
    private lateinit var client: CloudWatchLogsClient
    private lateinit var tableModel: ListTableModel<LogStreamEntry>
    private lateinit var table: TableView<LogStreamEntry>
    private lateinit var actor: LogActor<LogStreamEntry>

    @Before
    fun loadVariables() {
        client = mockClientManagerRule.create()
        tableModel = ListTableModel<LogStreamEntry>()
        table = TableView(tableModel)
        actor = LogStreamListActor(projectRule.project, client, table, "abc", "def")
    }

    @Test
    fun modelIsPopulated() {
        whenever(client.getLogEvents(Mockito.any<GetLogEventsRequest>()))
            .thenReturn(GetLogEventsResponse.builder().events(OutputLogEvent.builder().message("message").build()).build())
        runBlocking {
            actor.channel.send(LogActor.Message.LoadInitial)
            tableModel.waitForModelToBeAtLeast(1)
            waitForTrue { table.emptyText.text == message("cloudwatch.logs.no_events") }
        }
        assertThat(tableModel.items.size).isOne()
        assertThat(tableModel.items.first().message).isEqualTo("message")
    }

    @Test
    fun modelIsPopulatedRange() {
        whenever(client.getLogEventsPaginator(Mockito.any<GetLogEventsRequest>()))
            .thenReturn(object : GetLogEventsIterable(client, null) {
                override fun iterator() = mutableListOf(
                    GetLogEventsResponse.builder().events(
                        OutputLogEvent.builder().message("message").build()
                    ).build()
                ).iterator()
            })

        runBlocking {
            actor.channel.send(LogActor.Message.LoadInitialRange(LogStreamEntry("@@@", 0), Duration.ofMillis(0)))
            tableModel.waitForModelToBeAtLeast(1)
            waitForTrue { table.emptyText.text == message("cloudwatch.logs.no_events") }
        }

        assertThat(tableModel.items.size).isOne()
        assertThat(tableModel.items.first().message).isEqualTo("message")
        assertThat(table.emptyText.text).isEqualTo(message("cloudwatch.logs.no_events"))
    }

    @Test
    fun emptyTableOnExceptionThrown() {
        whenever(client.getLogEvents(Mockito.any<GetLogEventsRequest>())).then { throw IllegalStateException("network broke") }
        runBlocking {
            actor.channel.send(LogActor.Message.LoadInitial)
            waitForTrue {
                println(table.emptyText.text)
                table.emptyText.text == message("cloudwatch.logs.failed_to_load_stream", "def")
            }
        }
        assertThat(tableModel.items).isEmpty()
    }

    @Test
    fun emptyTableOnExceptionThrownRange() {
        whenever(client.getLogEvents(Mockito.any<GetLogEventsRequest>())).then { throw IllegalStateException("network broke") }
        runBlocking {
            actor.channel.send(LogActor.Message.LoadInitialRange(LogStreamEntry("@@@", 0), Duration.ofMillis(0)))
            waitForTrue { table.emptyText.text == message("cloudwatch.logs.failed_to_load_stream", "def") }
        }
        assertThat(tableModel.items).isEmpty()
    }

    @Test
    fun loadingForwardAppendsToTable() {
        whenever(client.getLogEvents(Mockito.any<GetLogEventsRequest>()))
            .thenReturn(GetLogEventsResponse.builder().events(OutputLogEvent.builder().message("message").build()).nextForwardToken("2").build())
            .thenReturn(GetLogEventsResponse.builder().nextForwardToken("3").build())
            .thenReturn(GetLogEventsResponse.builder().events(OutputLogEvent.builder().message("message2").build()).nextForwardToken("4").build())
        runBlocking {
            actor.channel.send(LogActor.Message.LoadInitial)
            tableModel.waitForModelToBeAtLeast(1)
        }
        assertThat(tableModel.items.size).isOne()
        assertThat(tableModel.items.first().message).isEqualTo("message")
        runBlocking {
            actor.channel.send(LogActor.Message.LoadForward)
            actor.channel.send(LogActor.Message.LoadForward)
            tableModel.waitForModelToBeAtLeast(2)
        }
        assertThat(tableModel.items.size).isEqualTo(2)
        assertThat(tableModel.items[1].message).isEqualTo("message2")
    }

    @Test
    fun loadingBackwardsPrependsToTable() {
        whenever(client.getLogEvents(Mockito.any<GetLogEventsRequest>()))
            .thenReturn(GetLogEventsResponse.builder().events(OutputLogEvent.builder().message("message").build()).nextBackwardToken("2").build())
            .thenReturn(GetLogEventsResponse.builder().nextBackwardToken("3").build())
            .thenReturn(
                GetLogEventsResponse.builder().events(OutputLogEvent.builder().message("message2").timestamp(3).build()).nextBackwardToken("2").build()
            )
        runBlocking {
            actor.channel.send(LogActor.Message.LoadInitial)
            tableModel.waitForModelToBeAtLeast(1)
        }
        assertThat(tableModel.items.size).isOne()
        assertThat(tableModel.items.first().message).isEqualTo("message")
        runBlocking {
            actor.channel.send(LogActor.Message.LoadBackward)
            actor.channel.send(LogActor.Message.LoadBackward)
            tableModel.waitForModelToBeAtLeast(2)
        }
        assertThat(tableModel.items.size).isEqualTo(2)
        assertThat(tableModel.items.first().message).isEqualTo("message2")
        assertThat(tableModel.items.first().timestamp).isEqualTo(3)
        assertThat(tableModel.items[1].message).isEqualTo("message")
        assertThat(tableModel.items[1].timestamp).isZero()
    }

    @Test
    fun writeChannelAndCoroutineIsDisposed() {
        val channel = actor.channel
        actor.dispose()
        assertThatThrownBy {
            runBlocking {
                channel.send(LogActor.Message.LoadBackward)
            }
        }.isInstanceOf(ClosedSendChannelException::class.java)
    }

    @Test
    fun loadInitialFilterThrows() {
        val client = mockClientManagerRule.create<CloudWatchLogsClient>()
        val tableModel = ListTableModel<LogStreamEntry>()
        val table = TableView(tableModel)
        val actor = LogStreamListActor(projectRule.project, client, table, "abc", "def")
        runBlocking {
            actor.channel.send(LogActor.Message.LoadInitialFilter("abc"))
            waitForTrue { actor.channel.isClosedForSend }
        }
    }
}
