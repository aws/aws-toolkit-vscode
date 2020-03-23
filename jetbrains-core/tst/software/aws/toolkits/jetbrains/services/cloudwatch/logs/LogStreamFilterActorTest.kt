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
import kotlinx.coroutines.isActive
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.TestCoroutineScope
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.mockito.Mockito
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsAsyncClient
import software.amazon.awssdk.services.cloudwatchlogs.model.FilterLogEventsRequest
import software.amazon.awssdk.services.cloudwatchlogs.model.FilterLogEventsResponse
import software.amazon.awssdk.services.cloudwatchlogs.model.FilteredLogEvent
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.utils.waitForFalse
import software.aws.toolkits.jetbrains.utils.waitForModelToBeAtLeast
import java.time.Duration
import java.util.concurrent.CompletableFuture

// ExperimentalCoroutinesApi is needed for TestCoroutineScope
@ExperimentalCoroutinesApi
class LogStreamFilterActorTest {
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
        val mockClient = mockClientManagerRule.create<CloudWatchLogsAsyncClient>()
        whenever(mockClient.filterLogEvents(Mockito.any<FilterLogEventsRequest>()))
            .thenReturn(
                CompletableFuture.completedFuture(
                    FilterLogEventsResponse
                        .builder()
                        .events(FilteredLogEvent.builder().message("message").build())
                        .build()
                )
            )
        val tableModel = ListTableModel<LogStreamEntry>()
        val table = TableView<LogStreamEntry>(tableModel)
        val actor = LogStreamFilterActor(projectRule.project, table, "abc", "def")
        runBlocking {
            actor.channel.send(LogStreamActor.Message.LOAD_INITIAL_FILTER("filter query"))
            tableModel.waitForModelToBeAtLeast(1)
        }
        assertThat(tableModel.items.size).isOne()
        assertThat(tableModel.items.first().message).isEqualTo("message")
    }

    @Test
    fun loadingForwardAppendsToTable() {
        val mockClient = mockClientManagerRule.create<CloudWatchLogsAsyncClient>()
        whenever(mockClient.filterLogEvents(Mockito.any<FilterLogEventsRequest>()))
            .thenReturn(
                CompletableFuture.completedFuture(
                    FilterLogEventsResponse
                        .builder()
                        .events(FilteredLogEvent.builder().message("message").build())
                        .nextToken("2")
                        .build()
                )
            )
            .thenReturn(
                CompletableFuture.completedFuture(
                    FilterLogEventsResponse
                        .builder()
                        .events(FilteredLogEvent.builder().message("message2").timestamp(2).build())
                        .nextToken("3")
                        .build()
                )
            )
        val tableModel = ListTableModel<LogStreamEntry>()
        val table = TableView<LogStreamEntry>(tableModel)
        val actor = LogStreamFilterActor(projectRule.project, table, "abc", "def")
        runBlocking {
            actor.channel.send(LogStreamActor.Message.LOAD_INITIAL_FILTER("filter query"))
            actor.channel.send(LogStreamActor.Message.LOAD_FORWARD())
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
        val mockClient = mockClientManagerRule.create<CloudWatchLogsAsyncClient>()
        whenever(mockClient.filterLogEvents(Mockito.any<FilterLogEventsRequest>()))
            .thenReturn(
                CompletableFuture.completedFuture(
                    FilterLogEventsResponse
                        .builder()
                        .events(FilteredLogEvent.builder().message("message").build())
                        .build()
                )
            )
            .thenReturn(
                CompletableFuture.completedFuture(
                    FilterLogEventsResponse
                        .builder()
                        .events(FilteredLogEvent.builder().message("message2").build())
                        .build()
                )
            )
        val tableModel = ListTableModel<LogStreamEntry>()
        val table = TableView<LogStreamEntry>(tableModel)
        val actor = LogStreamFilterActor(projectRule.project, table, "abc", "def")
        runBlocking {
            actor.channel.send(LogStreamActor.Message.LOAD_INITIAL_FILTER("filter query"))
            actor.channel.send(LogStreamActor.Message.LOAD_BACKWARD())
            actor.channel.send(LogStreamActor.Message.LOAD_BACKWARD())
            tableModel.waitForModelToBeAtLeast(1)
        }
        assertThat(tableModel.items).hasSize(1)
        assertThat(tableModel.items.first().message).isEqualTo("message")
    }

    @Test
    fun writeChannelAndCoroutineIsDisposed() {
        mockClientManagerRule.create<CloudWatchLogsAsyncClient>()
        val tableModel = ListTableModel<LogStreamEntry>()
        val table = TableView<LogStreamEntry>(tableModel)
        val coroutine = LogStreamFilterActor(projectRule.project, table, "abc", "def")
        val channel = coroutine.channel
        coroutine.dispose()
        assertThatThrownBy {
            runBlocking {
                channel.send(LogStreamActor.Message.LOAD_FORWARD())
            }
        }.isInstanceOf(ClosedSendChannelException::class.java)
        assertThat(coroutine.isActive).isFalse()
    }

    @Test
    fun loadInitialThrows() {
        mockClientManagerRule.create<CloudWatchLogsAsyncClient>()
        val tableModel = ListTableModel<LogStreamEntry>()
        val table = TableView<LogStreamEntry>(tableModel)
        val actor = LogStreamFilterActor(projectRule.project, table, "abc", "def")
        runBlocking {
            actor.channel.send(LogStreamActor.Message.LOAD_INITIAL())
            waitForFalse { actor.isActive }
        }
    }

    @Test
    fun loadInitialRangeThrows() {
        mockClientManagerRule.create<CloudWatchLogsAsyncClient>()
        val tableModel = ListTableModel<LogStreamEntry>()
        val table = TableView<LogStreamEntry>(tableModel)
        val actor = LogStreamFilterActor(projectRule.project, table, "abc", "def")
        runBlocking {
            actor.channel.send(LogStreamActor.Message.LOAD_INITIAL_RANGE(0, Duration.ofMillis(0)))
            waitForFalse { actor.isActive }
        }
    }
}
