// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights

import com.intellij.ui.table.TableView
import com.intellij.util.ui.ListTableModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runBlockingTest
import org.assertj.core.api.Assertions.assertThat
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.mockito.Mockito
import org.mockito.kotlin.any
import org.mockito.kotlin.verify
import org.mockito.kotlin.whenever
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.amazon.awssdk.services.cloudwatchlogs.model.CloudWatchLogsException
import software.amazon.awssdk.services.cloudwatchlogs.model.GetQueryResultsRequest
import software.amazon.awssdk.services.cloudwatchlogs.model.GetQueryResultsResponse
import software.amazon.awssdk.services.cloudwatchlogs.model.QueryStatus
import software.amazon.awssdk.services.cloudwatchlogs.model.ResultField
import software.amazon.awssdk.services.cloudwatchlogs.model.StopQueryRequest
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.InsightsQueryResultsActor
import software.aws.toolkits.jetbrains.utils.BaseCoroutineTest
import software.aws.toolkits.jetbrains.utils.waitForModelToBeAtLeast
import software.aws.toolkits.jetbrains.utils.waitForTrue
import software.aws.toolkits.resources.message
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@ExperimentalCoroutinesApi
class QueryActorTest : BaseCoroutineTest() {
    private lateinit var client: CloudWatchLogsClient
    private lateinit var tableModel: ListTableModel<LogResult>
    private lateinit var table: TableView<LogResult>
    private lateinit var queryactor: InsightsQueryResultsActor

    @Before
    fun setUp() {
        client = mockClientManagerRule.create()
        tableModel = ListTableModel()
        table = TableView(tableModel)
        queryactor = InsightsQueryResultsActor(projectRule.project, client, table, "1234")
    }

    @After
    fun tearDown() {
        Mockito.reset(client)
    }

    @Test
    fun `dedupes events`() {
        val sampleResults = listOf(
            ResultField.builder()
                .field("@message")
                .value("First Sample Message")
                .build(),
            ResultField.builder()
                .field("@ptr")
                .value("ptr")
                .build()
        )

        whenever(client.getQueryResults(any<GetQueryResultsRequest>()))
            .thenReturn(
                GetQueryResultsResponse.builder().status(QueryStatus.RUNNING).results(sampleResults).build()
            )
            .thenReturn(
                GetQueryResultsResponse.builder().status(QueryStatus.COMPLETE).results(sampleResults).build()
            )

        runBlockingTest {
            queryactor.channel.send(InsightsQueryResultsActor.Message.StartLoadingAll)
            tableModel.waitForModelToBeAtLeast(1)
        }

        assertThat(tableModel.items.size).isOne()
        assertThat(tableModel.items.first().keys).contains("@message")
    }

    @Test
    fun `loads events`() {
        val sampleResult1 = ResultField.builder()
            .field("@ptr")
            .value("1234")
            .build()
        val firstSampleResultList = listOf(sampleResult1)
        val sampleResult2 = ResultField.builder()
            .field("@ptr")
            .value("5678")
            .build()
        val secondSampleResultList = listOf(sampleResult2)
        whenever(client.getQueryResults(Mockito.any<GetQueryResultsRequest>()))
            .thenReturn(
                GetQueryResultsResponse.builder().status(QueryStatus.RUNNING).results(firstSampleResultList).build()
            )
            .thenReturn(
                GetQueryResultsResponse.builder().status(QueryStatus.COMPLETE).results(firstSampleResultList, secondSampleResultList).build()
            )
        runBlockingTest {
            queryactor.channel.send(InsightsQueryResultsActor.Message.StartLoadingAll)
            tableModel.waitForModelToBeAtLeast(2)
        }
        assertThat(tableModel.items.size).isEqualTo(2)
        assertThat(tableModel.items[0].values).isEqualTo(setOf("1234"))
        assertThat(tableModel.items[1].values).isEqualTo(setOf("5678"))
    }

    @Test
    fun `loads partially`() {
        val sampleResults = listOf(
            ResultField.builder()
                .field("@message")
                .value("First Sample Message")
                .build(),
            ResultField.builder()
                .field("@ptr")
                .value("ptr")
                .build()
        )

        whenever(client.getQueryResults(any<GetQueryResultsRequest>()))
            .thenReturn(
                GetQueryResultsResponse.builder().status(QueryStatus.RUNNING).results(sampleResults).build()
            )
            .thenThrow(
                CloudWatchLogsException::class.java
            )

        runBlockingTest {
            queryactor.channel.send(InsightsQueryResultsActor.Message.StartLoadingAll)
            while (!queryactor.channel.isClosedForSend) {
                delay(10)
            }
        }

        assertThat(tableModel.items.size).isOne()
        assertThat(tableModel.items.first().keys).contains("@message")
    }

    @Test
    fun `no results`() {
        whenever(client.getQueryResults(Mockito.any<GetQueryResultsRequest>()))
            .thenReturn(
                GetQueryResultsResponse.builder().status(QueryStatus.COMPLETE).build()
            )
        runBlockingTest {
            queryactor.channel.send(InsightsQueryResultsActor.Message.StartLoadingAll)
            waitForTrue { table.emptyText.text == message("cloudwatch.logs.no_results_found") }
        }
        assertThat(tableModel.items).isEmpty()
    }

    @Test
    fun `errors immediately`() {
        whenever(client.getQueryResults(any<GetQueryResultsRequest>()))
            .thenThrow(
                CloudWatchLogsException::class.java
            )

        runBlocking {
            queryactor.channel.send(InsightsQueryResultsActor.Message.StartLoadingAll)
            waitForTrue { table.emptyText.text == message("cloudwatch.logs.query_results_table_error") }
        }

        assertThat(tableModel.items.size).isZero()
    }

    @Test
    fun `stop loading`() {
        val sampleResult1 = ResultField.builder()
            .field("@ptr")
            .value("p1234")
            .build()
        val firstSampleResultList = listOf(sampleResult1)
        val sampleResult2 = ResultField.builder()
            .field("@ptr")
            .value("5678")
            .build()
        val secondSampleResultList = listOf(sampleResult2)
        whenever(client.getQueryResults(any<GetQueryResultsRequest>()))
            .thenReturn(
                GetQueryResultsResponse.builder().status(QueryStatus.RUNNING).results(firstSampleResultList).build()
            )
            .thenAnswer {
                runBlocking {
                    delay(90_000)
                }
                GetQueryResultsResponse.builder().status(QueryStatus.COMPLETE).results(firstSampleResultList, secondSampleResultList).build()
            }

        val latch = CountDownLatch(1)
        whenever(client.stopQuery(any<StopQueryRequest>()))
            .thenAnswer {
                latch.countDown()
            }

        runBlockingTest {
            queryactor.channel.send(InsightsQueryResultsActor.Message.StartLoadingAll)
            tableModel.waitForModelToBeAtLeast(1)
            queryactor.channel.send(InsightsQueryResultsActor.Message.StopLoading)

            while (!queryactor.channel.isClosedForSend) {
                delay(10)
            }
        }

        assertThat(tableModel.items.size).isEqualTo(1)
        assertThat(tableModel.items[0].values).isEqualTo(setOf("p1234"))
        assertThat(latch.await(5, TimeUnit.SECONDS)).isTrue()
        verify(client).stopQuery(StopQueryRequest.builder().queryId("1234").build())
    }
}
