// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs

import com.intellij.testFramework.ProjectRule
import com.intellij.ui.table.TableView
import com.intellij.util.ui.ListTableModel
import com.nhaarman.mockitokotlin2.whenever
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.channels.ClosedSendChannelException
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.TestCoroutineScope
import kotlinx.coroutines.withTimeout
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.mockito.Mockito
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsAsyncClient
import software.amazon.awssdk.services.cloudwatchlogs.model.GetLogEventsRequest
import software.amazon.awssdk.services.cloudwatchlogs.model.GetLogEventsResponse
import software.amazon.awssdk.services.cloudwatchlogs.model.OutputLogEvent
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.resources.message
import java.util.concurrent.CompletableFuture

// ExperimentalCoroutinesApi is needed for TestCoroutineScope
@ExperimentalCoroutinesApi
class LogStreamActorTest {
    @JvmField
    @Rule
    val projectRule = ProjectRule()

    @JvmField
    @Rule
    val mockClientManagerRule = MockClientManagerRule(projectRule)

    private val testCoroutineScope: TestCoroutineScope = TestCoroutineScope()

    @After
    fun after() {
        testCoroutineScope.cleanupTestCoroutines()
    }

    @Test
    fun modelIsPopulated() {
        val mockClient = mockClientManagerRule.create<CloudWatchLogsAsyncClient>()
        whenever(mockClient.getLogEvents(Mockito.any<GetLogEventsRequest>()))
            .thenReturn(CompletableFuture.completedFuture(GetLogEventsResponse.builder().events(OutputLogEvent.builder().message("message").build()).build()))
        val tableModel = ListTableModel<OutputLogEvent>()
        val table = TableView<OutputLogEvent>(tableModel)
        val coroutine = LogStreamActor(mockClient, table, "abc", "def")
        runBlocking {
            coroutine.loadInitial()
        }
        assertThat(tableModel.items.size).isOne()
        assertThat(tableModel.items.first().message()).isEqualTo("message")
        assertThat(table.emptyText.text).isEqualTo(message("cloudwatch.logs.no_events"))
    }

    @Test
    fun modelIsPopulatedRange() {
        val mockClient = mockClientManagerRule.create<CloudWatchLogsAsyncClient>()
        whenever(mockClient.getLogEvents(Mockito.any<GetLogEventsRequest>()))
            .thenReturn(CompletableFuture.completedFuture(GetLogEventsResponse.builder().events(OutputLogEvent.builder().message("message").build()).build()))
        val tableModel = ListTableModel<OutputLogEvent>()
        val table = TableView<OutputLogEvent>(tableModel)
        val coroutine = LogStreamActor(mockClient, table, "abc", "def")
        runBlocking {
            coroutine.loadInitialRange(0L, 0L)
        }
        assertThat(tableModel.items.size).isOne()
        assertThat(tableModel.items.first().message()).isEqualTo("message")
        assertThat(table.emptyText.text).isEqualTo(message("cloudwatch.logs.no_events"))
    }

    @Test
    fun emptyTableOnExceptionThrown() {
        val mockClient = mockClientManagerRule.create<CloudWatchLogsAsyncClient>()
        whenever(mockClient.getLogEvents(Mockito.any<GetLogEventsRequest>())).then { throw IllegalStateException("network broke") }
        val tableModel = ListTableModel<OutputLogEvent>()
        val table = TableView<OutputLogEvent>(tableModel)
        val coroutine = LogStreamActor(mockClient, table, "abc", "def")
        assertThatThrownBy { runBlocking { coroutine.loadInitial() } }.hasMessage("network broke")
        assertThat(tableModel.items).isEmpty()
        assertThat(table.emptyText.text).isEqualTo(message("cloudwatch.logs.no_events"))
    }

    @Test
    fun emptyTableOnExceptionThrownRange() {
        val mockClient = mockClientManagerRule.create<CloudWatchLogsAsyncClient>()
        whenever(mockClient.getLogEvents(Mockito.any<GetLogEventsRequest>())).then { throw IllegalStateException("network broke") }
        val tableModel = ListTableModel<OutputLogEvent>()
        val table = TableView<OutputLogEvent>(tableModel)
        val coroutine = LogStreamActor(mockClient, table, "abc", "def")
        assertThatThrownBy { runBlocking { coroutine.loadInitialRange(0L, 0L) } }.hasMessage("network broke")
        assertThat(tableModel.items).isEmpty()
        assertThat(table.emptyText.text).isEqualTo(message("cloudwatch.logs.no_events"))
    }

    @Test
    fun loadingForwardAppendsToTable() {
        val mockClient = mockClientManagerRule.create<CloudWatchLogsAsyncClient>()
        whenever(mockClient.getLogEvents(Mockito.any<GetLogEventsRequest>()))
            .thenReturn(CompletableFuture.completedFuture(GetLogEventsResponse.builder().events(OutputLogEvent.builder().message("message").build()).build()))
            .thenReturn(CompletableFuture.completedFuture(GetLogEventsResponse.builder().build()))
            .thenReturn(CompletableFuture.completedFuture(GetLogEventsResponse.builder().events(OutputLogEvent.builder().message("message2").build()).build()))
        val tableModel = ListTableModel<OutputLogEvent>()
        val table = TableView<OutputLogEvent>(tableModel)
        val coroutine = LogStreamActor(mockClient, table, "abc", "def")
        runBlocking {
            coroutine.loadInitial()
        }
        assertThat(tableModel.items.size).isOne()
        assertThat(tableModel.items.first().message()).isEqualTo("message")
        testCoroutineScope.launch {
            coroutine.startListening()
        }
        runBlocking {
            coroutine.channel.send(LogStreamActor.Messages.LOAD_FORWARD)
            coroutine.channel.send(LogStreamActor.Messages.LOAD_FORWARD)
            waitForModelToBeAtLeastSize(tableModel, 2)
        }
        assertThat(tableModel.items.size).isEqualTo(2)
        assertThat(tableModel.items[1].message()).isEqualTo("message2")
    }

    @Test
    fun loadingBackwardsPrependsToTable() {
        val mockClient = mockClientManagerRule.create<CloudWatchLogsAsyncClient>()
        whenever(mockClient.getLogEvents(Mockito.any<GetLogEventsRequest>()))
            .thenReturn(CompletableFuture.completedFuture(GetLogEventsResponse.builder().events(OutputLogEvent.builder().message("message").build()).build()))
            .thenReturn(CompletableFuture.completedFuture(GetLogEventsResponse.builder().build()))
            .thenReturn(CompletableFuture.completedFuture(GetLogEventsResponse.builder().events(OutputLogEvent.builder().message("message2").build()).build()))
        val tableModel = ListTableModel<OutputLogEvent>()
        val table = TableView<OutputLogEvent>(tableModel)
        val coroutine = LogStreamActor(mockClient, table, "abc", "def")
        runBlocking {
            coroutine.loadInitial()
        }
        assertThat(tableModel.items.size).isOne()
        assertThat(tableModel.items.first().message()).isEqualTo("message")
        testCoroutineScope.launch {
            coroutine.startListening()
        }
        runBlocking {
            coroutine.channel.send(LogStreamActor.Messages.LOAD_BACKWARD)
            coroutine.channel.send(LogStreamActor.Messages.LOAD_BACKWARD)
            waitForModelToBeAtLeastSize(tableModel, 2)
        }
        assertThat(tableModel.items.size).isEqualTo(2)
        assertThat(tableModel.items.first().message()).isEqualTo("message2")
        assertThat(tableModel.items[1].message()).isEqualTo("message")
    }

    @Test
    fun writeChannelAndCoroutineIsDisposed() {
        val mockClient = mockClientManagerRule.create<CloudWatchLogsAsyncClient>()
        val tableModel = ListTableModel<OutputLogEvent>()
        val table = TableView<OutputLogEvent>(tableModel)
        val coroutine = LogStreamActor(mockClient, table, "abc", "def")
        val channel = coroutine.channel
        coroutine.dispose()
        assertThatThrownBy {
            runBlocking {
                channel.send(LogStreamActor.Messages.LOAD_BACKWARD)
            }
        }.isInstanceOf(ClosedSendChannelException::class.java)
        assertThat(coroutine.isActive).isFalse()
    }

    private suspend fun waitForModelToBeAtLeastSize(list: ListTableModel<OutputLogEvent>, size: Int) = withTimeout(100) {
        while (list.items.size < size) {
            delay(10)
        }
    }
}
