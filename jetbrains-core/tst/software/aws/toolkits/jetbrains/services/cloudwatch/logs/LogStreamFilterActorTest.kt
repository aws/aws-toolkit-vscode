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
import software.amazon.awssdk.services.cloudwatchlogs.model.FilterLogEventsRequest
import software.amazon.awssdk.services.cloudwatchlogs.model.FilterLogEventsResponse
import software.amazon.awssdk.services.cloudwatchlogs.model.FilteredLogEvent
import software.aws.toolkits.jetbrains.utils.BaseCoroutineTest
import software.aws.toolkits.jetbrains.utils.waitForModelToBeAtLeast
import software.aws.toolkits.jetbrains.utils.waitForTrue
import java.time.Duration

@ExperimentalCoroutinesApi
class LogStreamFilterActorTest : BaseCoroutineTest() {
    private lateinit var client: CloudWatchLogsClient
    private lateinit var tableModel: ListTableModel<LogStreamEntry>
    private lateinit var table: TableView<LogStreamEntry>
    private lateinit var actor: LogActor<LogStreamEntry>

    @Before
    fun loadVariables() {
        client = mockClientManagerRule.create()
        tableModel = ListTableModel<LogStreamEntry>()
        table = TableView(tableModel)
        actor = LogStreamFilterActor(projectRule.project, client, table, "abc", "def")
    }

    @Test
    fun modelIsPopulated() {
        whenever(client.filterLogEvents(Mockito.any<FilterLogEventsRequest>()))
            .thenReturn(
                FilterLogEventsResponse
                    .builder()
                    .events(FilteredLogEvent.builder().message("message").build())
                    .build()
            )
        runBlocking {
            actor.channel.send(LogActor.Message.LoadInitialFilter("filter query"))
            tableModel.waitForModelToBeAtLeast(1)
        }
        assertThat(tableModel.items.size).isOne()
        assertThat(tableModel.items.first().message).isEqualTo("message")
    }

    @Test
    fun loadingForwardAppendsToTable() {
        whenever(client.filterLogEvents(Mockito.any<FilterLogEventsRequest>()))
            .thenReturn(
                FilterLogEventsResponse
                    .builder()
                    .events(FilteredLogEvent.builder().message("message").build())
                    .nextToken("2")
                    .build()
            )
            .thenReturn(
                FilterLogEventsResponse
                    .builder()
                    .events(FilteredLogEvent.builder().message("message2").timestamp(2).build())
                    .nextToken("3")
                    .build()
            )
        runBlocking {
            actor.channel.send(LogActor.Message.LoadInitialFilter("filter query"))
            actor.channel.send(LogActor.Message.LoadForward)
            tableModel.waitForModelToBeAtLeast(2)
        }
        assertThat(tableModel.items).hasSize(2)
        assertThat(tableModel.items.first().message).isEqualTo("message")
        assertThat(tableModel.items.first().timestamp).isZero()
        assertThat(tableModel.items[1].message).isEqualTo("message2")
        assertThat(tableModel.items[1].timestamp).isEqualTo(2)
    }

    @Test
    fun loadingBackwardsDoesNothing() {
        whenever(client.filterLogEvents(Mockito.any<FilterLogEventsRequest>()))
            .thenReturn(
                FilterLogEventsResponse
                    .builder()
                    .events(FilteredLogEvent.builder().message("message").build())
                    .build()
            )
            .thenReturn(
                FilterLogEventsResponse
                    .builder()
                    .events(FilteredLogEvent.builder().message("message2").build())
                    .build()
            )
        runBlocking {
            actor.channel.send(LogActor.Message.LoadInitialFilter("filter query"))
            actor.channel.send(LogActor.Message.LoadBackward)
            actor.channel.send(LogActor.Message.LoadBackward)
            tableModel.waitForModelToBeAtLeast(1)
        }
        assertThat(tableModel.items).hasSize(1)
        assertThat(tableModel.items.first().message).isEqualTo("message")
    }

    @Test
    fun writeChannelAndCoroutineIsDisposed() {
        val channel = actor.channel
        actor.dispose()
        assertThatThrownBy {
            runBlocking {
                channel.send(LogActor.Message.LoadForward)
            }
        }.isInstanceOf(ClosedSendChannelException::class.java)
    }

    @Test
    fun loadInitialThrows() {
        runBlocking {
            actor.channel.send(LogActor.Message.LoadInitial)
            waitForTrue { actor.channel.isClosedForSend }
        }
    }

    @Test
    fun loadInitialRangeThrows() {
        runBlocking {
            actor.channel.send(LogActor.Message.LoadInitialRange(LogStreamEntry("@@@", 0), Duration.ofMillis(0)))
            waitForTrue { actor.channel.isClosedForSend }
        }
    }
}
