// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights

import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project
import com.intellij.ui.table.TableView
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.amazon.awssdk.services.cloudwatchlogs.model.GetQueryResultsRequest
import software.amazon.awssdk.services.cloudwatchlogs.model.QueryStatus
import software.amazon.awssdk.services.cloudwatchlogs.model.ResourceNotFoundException
import software.amazon.awssdk.services.cloudwatchlogs.model.ResultField
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.getCoroutineUiContext
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message

sealed class QueryActor<T>(
    private val project: Project,
    protected val client: CloudWatchLogsClient,
    private val table: TableView<T>
) : CoroutineScope by ApplicationThreadPoolScope("InsightsResultTable"), Disposable {
    val channel = Channel<MessageLoadQueryResults>()
    protected var moreResultsAvailable: Boolean = false
    protected abstract val emptyText: String
    protected abstract val tableErrorMessage: String
    protected abstract val notFoundText: String

    private val edtContext = getCoroutineUiContext(disposable = this@QueryActor)
    private val exceptionHandler = CoroutineExceptionHandler { _, e ->
        LOG.error(e) { "Exception thrown in Query Results not handled:" }
        notifyError(title = message("general.unknown_error"), project = project)
        channel.close()
    }

    sealed class MessageLoadQueryResults {
        object LoadInitialQueryResults : MessageLoadQueryResults()
        object LoadNextQueryBatch : MessageLoadQueryResults()
    }

    init {
        launch(exceptionHandler) {
            for (message in channel) {
                handleMessages(message)
            }
        }
    }

    private suspend fun handleMessages(message: MessageLoadQueryResults) {
            when (message) {
                is MessageLoadQueryResults.LoadNextQueryBatch -> {
                if (moreResultsAvailable) {
                    withContext(edtContext) { table.setPaintBusy(true) }
                    val items = loadNext()
                    withContext(edtContext) {
                        table.listTableModel.addRows(items)
                        table.setPaintBusy(false)
                    }
                } else {
                    notifyInfo(message("cloudwatch.logs.query_result_completion_status"), message("cloudwatch.logs.query_result_completion_successful"))
                }
            }
                is MessageLoadQueryResults.LoadInitialQueryResults -> {
                    loadInitialQueryResults()
                    val rect = table.getCellRect(0, 0, true)
                    withContext(edtContext) {
                        table.scrollRectToVisible(rect)
                    }
                }
            }
    }

    protected suspend fun loadAndPopulateResultsTable(loadBlock: suspend() -> List<T>) {
        try {
            tableLoading()
            val items = loadBlock()
            table.listTableModel.items = items
            table.emptyText.text = emptyText
        } catch (e: ResourceNotFoundException) {
            withContext(edtContext) {
                table.emptyText.text = notFoundText
            }
        } catch (e: Exception) {
            LOG.error(e) { tableErrorMessage }
            withContext(edtContext) {
                table.emptyText.text = tableErrorMessage
                notifyError(title = tableErrorMessage, project = project)
            }
        } finally {
            tableDoneLoading()
        }
    }

    protected open suspend fun loadInitialQueryResults() {
        throw IllegalStateException("Table does not support loadInitialQueryResults")
    }

    protected abstract suspend fun loadNext(): List<T>

    private suspend fun tableLoading() = withContext(edtContext) {
        table.setPaintBusy(true)
        table.emptyText.text = message("loading_resource.loading")
    }

    private suspend fun tableDoneLoading() = withContext(edtContext) {
        table.tableViewModel.fireTableDataChanged()
        table.setPaintBusy(false)
    }

    override fun dispose() {
        channel.close()
    }
    companion object {
        private val LOG = getLogger<QueryActor<*>>()
    }
}

class QueryResultsActor(
    project: Project,
    client: CloudWatchLogsClient,
    table: TableView<Map<String, String>>,
    private val queryId: String
) : QueryActor<Map<String, String>>(project, client, table) {
    override val emptyText = message("cloudwatch.logs.no_results_found")
    override val tableErrorMessage = message("cloudwatch.logs.query_results_table_error")
    override val notFoundText = message("cloudwatch.logs.no_results_found")

    override suspend fun loadInitialQueryResults() {
        var request = GetQueryResultsRequest.builder().queryId(queryId).build()
        var response = client.getQueryResults(request)
        while (response.results().size == 0) {
            request = GetQueryResultsRequest.builder().queryId(queryId).build()
            response = client.getQueryResults(request)
        }
        val queryResults = response.results().filterNotNull()
        val listOfResults = queryResults.map {
            result -> result.map { it.field().toString() to it.value().toString() }.toMap() }
        listOfResults.iterator().forEach { it["@ptr"]?.let { it1 -> queryResultsIdentifierList.add(it1) } }
        moreResultsAvailable = response.status() != QueryStatus.COMPLETE

        loadAndPopulateResultsTable { listOfResults }
    }

    override suspend fun loadNext(): List<Map<String, String>> {
        val request = GetQueryResultsRequest.builder().queryId(queryId).build()
        val response = client.getQueryResults(request)
        moreResultsAvailable = response.status() != QueryStatus.COMPLETE
        return checkIfNewResult(response.results().filterNotNull())
    }

    fun checkIfNewResult(queryResultList: List<MutableList<ResultField>>): List<Map<String, String>> {
        // Since the results are cumulative, if the order of results change, this function ensures that the same results are not displayed repeatedly
        val listOfResults = arrayListOf<Map<String, String>>()
        for (result in queryResultList) {
            var fieldToValueMap = result.map { it.field() to it.value() }.toMap()
            // @ptr is a unique identifier for each resultant log event which is used here to ensure results are not repeatedly displayed
            if (fieldToValueMap["@ptr"] !in queryResultsIdentifierList) {
                fieldToValueMap["@ptr"]?.let { queryResultsIdentifierList.add(it) }
                listOfResults.add(fieldToValueMap)
            }
        }
        return listOfResults
    }
    companion object {
        val queryResultsIdentifierList = arrayListOf<String>()
    }
}
