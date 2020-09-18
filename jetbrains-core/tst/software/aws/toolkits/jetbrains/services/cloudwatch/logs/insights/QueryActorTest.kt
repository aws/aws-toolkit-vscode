// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights

import com.intellij.ui.table.TableView
import com.intellij.util.ui.ListTableModel
import com.nhaarman.mockitokotlin2.whenever
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Test
import org.mockito.Mockito
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.amazon.awssdk.services.cloudwatchlogs.model.GetQueryResultsRequest
import software.amazon.awssdk.services.cloudwatchlogs.model.GetQueryResultsResponse
import software.amazon.awssdk.services.cloudwatchlogs.model.ResultField
import software.aws.toolkits.jetbrains.utils.BaseCoroutineTest
import software.aws.toolkits.jetbrains.utils.waitForModelToBeAtLeast

class QueryActorTest : BaseCoroutineTest() {
    private lateinit var client: CloudWatchLogsClient
    private lateinit var tableModel: ListTableModel<Map<String, String>>
    private lateinit var table: TableView<Map<String, String>>
    private lateinit var queryactor: QueryActor<Map<String, String>>

    @Before
    fun setUp() {
        client = mockClientManagerRule.create()
        tableModel = ListTableModel<Map<String, String>>()
        table = TableView(tableModel)
        queryactor = QueryResultsActor(projectRule.project, client, table, "1234")
    }

    @Test
    fun `checkIfNewResult dedupes events`() {
        val sampleResult1 = ResultField.builder()
            .field("@message")
            .value("First Sample Message")
            .field("@ptr")
            .value("1234")
            .build()
        val queryResultsActor = QueryResultsActor(projectRule.project, client, table, "abcdef")
        val resultList = listOf(listOf(sampleResult1))

        assertThat(queryResultsActor.checkIfNewResult(resultList)).hasSize(1)
        assertThat(queryResultsActor.checkIfNewResult(resultList)).hasSize(0)
    }

    @Test
    fun `Initial log events are loaded in the table model`() {
        val ptr = ResultField.builder().field("@ptr").value("ptr").build()
        val sampleResult = ResultField.builder().field("@message").value("Sample Message").build()
        val sampleResultList = listOf(ptr, sampleResult)
        whenever(client.getQueryResults(Mockito.any<GetQueryResultsRequest>()))
            .thenReturn(
                GetQueryResultsResponse.builder().results(sampleResultList).build()
            )
        runBlocking {
            queryactor.channel.send(QueryActor.MessageLoadQueryResults.LoadInitialQueryResults)
            tableModel.waitForModelToBeAtLeast(1)
        }
        assertThat(tableModel.items.size).isOne()
        assertThat(tableModel.items.first().keys).contains("@message")
    }

    @Test
    fun `Loading more log events in table model after the initial results`() {
        val sampleResult1 = ResultField.builder()
            .field("@ptr")
            .value("1234")
            .build()
        val firstSampleResultList = listOf(sampleResult1)
        val sampleResult2 = ResultField.builder()
            .field("@ptr").value("5678")
            .build()
        val secondSampleResultList = listOf(sampleResult2)
        whenever(client.getQueryResults(Mockito.any<GetQueryResultsRequest>()))
            .thenReturn(
                GetQueryResultsResponse.builder().results(firstSampleResultList).build()
            )
            .thenReturn(
                GetQueryResultsResponse.builder().results(firstSampleResultList, secondSampleResultList).build()
            )
        runBlocking {
            queryactor.channel.send(QueryActor.MessageLoadQueryResults.LoadInitialQueryResults)
            queryactor.channel.send(QueryActor.MessageLoadQueryResults.LoadNextQueryBatch)
            tableModel.waitForModelToBeAtLeast(2)
        }
        assertThat(tableModel.items.size).isEqualTo(2)
        assertThat(tableModel.items[0].keys).isEqualTo(setOf("@ptr"))
        assertThat(tableModel.items[0].keys).isEqualTo(setOf("@ptr"))
    }
}
