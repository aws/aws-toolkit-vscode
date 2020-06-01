// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs

import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.ui.TableUtil
import com.intellij.ui.table.TableView
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.amazon.awssdk.services.cloudwatchlogs.model.DescribeLogStreamsRequest
import software.amazon.awssdk.services.cloudwatchlogs.model.FilterLogEventsRequest
import software.amazon.awssdk.services.cloudwatchlogs.model.GetLogEventsRequest
import software.amazon.awssdk.services.cloudwatchlogs.model.LogStream
import software.amazon.awssdk.services.cloudwatchlogs.model.OrderBy
import software.amazon.awssdk.services.cloudwatchlogs.model.ResourceNotFoundException
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.getCoroutineUiContext
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import java.time.Duration

sealed class LogActor<T>(
    private val project: Project,
    protected val client: CloudWatchLogsClient,
    private val table: TableView<T>
) : CoroutineScope by ApplicationThreadPoolScope("CloudWatchLogsStream"), Disposable {
    val channel = Channel<Message>()

    protected var nextBackwardToken: String? = null
    protected var nextForwardToken: String? = null
    protected abstract val emptyText: String
    protected abstract val tableErrorMessage: String
    protected abstract val notFoundText: String

    private val edtContext = getCoroutineUiContext(disposable = this@LogActor)
    private val exceptionHandler = CoroutineExceptionHandler { _, e ->
        LOG.error(e) { "Exception thrown in the LogStreamActor not handled:" }
        notifyError(title = message("general.unknown_error"), project = project)
        table.setPaintBusy(false)
        Disposer.dispose(this)
    }

    sealed class Message {
        object LoadInitial : Message()
        class LoadInitialRange(val previousEvent: LogStreamEntry, val duration: Duration) : Message()
        class LoadInitialFilter(val queryString: String) : Message()
        object LoadForward : Message()
        object LoadBackward : Message()
    }

    init {
        launch(exceptionHandler) {
            handleMessages()
        }
    }

    private suspend fun handleMessages() {
        for (message in channel) {
            when (message) {
                is Message.LoadForward -> if (!nextForwardToken.isNullOrEmpty()) {
                    withContext(edtContext) { table.setPaintBusy(true) }
                    val items = loadMore(nextForwardToken, saveForwardToken = true)
                    withContext(edtContext) {
                        table.listTableModel.addRows(items)
                        table.setPaintBusy(false)
                    }
                }
                is Message.LoadBackward -> if (!nextBackwardToken.isNullOrEmpty()) {
                    withContext(edtContext) { table.setPaintBusy(true) }
                    val items = loadMore(nextBackwardToken, saveBackwardToken = true)
                    if (items.isNotEmpty()) {
                        // Selected rows can be non contiguous so we have to save every row selected
                        val newSelection = table.selectedRows.map { it + items.size }
                        val viewRect = table.visibleRect
                        table.listTableModel.items = items + table.listTableModel.items
                        withContext(edtContext) {
                            table.tableViewModel.fireTableDataChanged()
                            val offset = table.getCellRect(items.size, 0, true)
                            // Move the view box down y - cell height amount to stay in the same place
                            viewRect.y = (viewRect.y + offset.y - offset.height)
                            table.scrollRectToVisible(viewRect)
                            // Re-add the selection
                            newSelection.forEach {
                                table.addRowSelectionInterval(it, it)
                            }
                        }
                    }
                    withContext(edtContext) { table.setPaintBusy(false) }
                }
                is Message.LoadInitial -> {
                    loadInitial()
                    // make sure the scroll pane is at the top after loading. Needed for Refresh!
                    val rect = table.getCellRect(0, 0, true)
                    withContext(edtContext) {
                        table.scrollRectToVisible(rect)
                    }
                }
                is Message.LoadInitialRange -> {
                    loadInitialRange(message.previousEvent.timestamp, message.duration)
                    val item = table.listTableModel.items.firstOrNull { it == message.previousEvent }
                    val index = table.listTableModel.indexOf(item).takeIf { it > 0 } ?: return
                    withContext(edtContext) {
                        table.setRowSelectionInterval(index, index)
                        TableUtil.scrollSelectionToVisible(table)
                    }
                }
                is Message.LoadInitialFilter -> {
                    loadInitialFilter(message.queryString)
                }
            }
        }
    }

    protected suspend fun loadAndPopulate(loadBlock: suspend () -> List<T>) {
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

    protected open suspend fun loadInitial() {
        throw IllegalStateException("Table does not support loadInitial")
    }

    protected open suspend fun loadInitialRange(startTime: Long, duration: Duration) {
        throw IllegalStateException("Table does not support loadInitialRange")
    }

    protected open suspend fun loadInitialFilter(queryString: String) {
        throw IllegalStateException("Table does not support loadInitialFilter")
    }

    protected abstract suspend fun loadMore(nextToken: String?, saveForwardToken: Boolean = false, saveBackwardToken: Boolean = false): List<T>

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
        private val LOG = getLogger<LogActor<*>>()
    }
}

class LogStreamFilterActor(
    project: Project,
    client: CloudWatchLogsClient,
    table: TableView<LogStreamEntry>,
    private val logGroup: String,
    private val logStream: String
) : LogActor<LogStreamEntry>(project, client, table) {
    override val emptyText = message("cloudwatch.logs.no_events_query", logStream)
    override val tableErrorMessage = message("cloudwatch.logs.failed_to_load_stream", logStream)
    override val notFoundText = message("cloudwatch.logs.log_stream_does_not_exist", logStream)

    override suspend fun loadInitialFilter(queryString: String) {
        val request = FilterLogEventsRequest
            .builder()
            .logGroupName(logGroup)
            .logStreamNames(logStream)
            .filterPattern(queryString)
            .build()
        loadAndPopulate { getSearchLogEvents(request) }
    }

    override suspend fun loadMore(nextToken: String?, saveForwardToken: Boolean, saveBackwardToken: Boolean): List<LogStreamEntry> {
        // loading backwards doesn't make sense in this context, so just skip the event
        if (saveBackwardToken) {
            return listOf()
        }

        val request = FilterLogEventsRequest
            .builder()
            .logGroupName(logGroup)
            .logStreamNames(logStream)
            .nextToken(nextToken)
            .build()

        return getSearchLogEvents(request)
    }

    private fun getSearchLogEvents(request: FilterLogEventsRequest): List<LogStreamEntry> {
        val response = client.filterLogEvents(request)
        val events = response.events().filterNotNull().map { it.toLogStreamEntry() }
        nextForwardToken = response.nextToken()

        return events
    }
}

class LogStreamListActor(
    project: Project,
    client: CloudWatchLogsClient,
    table: TableView<LogStreamEntry>,
    private val logGroup: String,
    private val logStream: String
) :
    LogActor<LogStreamEntry>(project, client, table) {
    override val emptyText = message("cloudwatch.logs.no_events")
    override val tableErrorMessage = message("cloudwatch.logs.failed_to_load_stream", logStream)
    override val notFoundText = message("cloudwatch.logs.log_stream_does_not_exist", logStream)

    override suspend fun loadInitial() {
        val request = GetLogEventsRequest
            .builder()
            .logGroupName(logGroup)
            .logStreamName(logStream)
            .startFromHead(true)
            .build()
        loadAndPopulate { getLogEvents(request, saveForwardToken = true, saveBackwardToken = true) }
    }

    override suspend fun loadInitialRange(startTime: Long, duration: Duration) = loadAndPopulate {
        val events = mutableListOf<LogStreamEntry>()
        client.getLogEventsPaginator {
            it.logGroupName(logGroup)
                .logStreamName(logStream)
                .startFromHead(true)
                .startTime(startTime - duration.toMillis())
                .endTime(startTime + duration.toMillis())
        }.stream().forEach { response ->
            if (nextBackwardToken == null) {
                nextBackwardToken = response.nextBackwardToken()
            }
            nextForwardToken = response.nextForwardToken()
            events.addAll(response.events().mapNotNull { it.toLogStreamEntry() })
        }
        return@loadAndPopulate events
    }

    override suspend fun loadMore(nextToken: String?, saveForwardToken: Boolean, saveBackwardToken: Boolean): List<LogStreamEntry> {
        val request = GetLogEventsRequest
            .builder()
            .logGroupName(logGroup)
            .logStreamName(logStream)
            .startFromHead(true)
            .nextToken(nextToken)
            .build()

        return getLogEvents(request, saveForwardToken = saveForwardToken, saveBackwardToken = saveBackwardToken)
    }

    private fun getLogEvents(
        request: GetLogEventsRequest,
        saveForwardToken: Boolean = false,
        saveBackwardToken: Boolean = false
    ): List<LogStreamEntry> {
        val response = client.getLogEvents(request)
        val events = response.events().filterNotNull().map { it.toLogStreamEntry() }
        if (saveForwardToken) {
            nextForwardToken = response.nextForwardToken()
        }
        if (saveBackwardToken) {
            nextBackwardToken = response.nextBackwardToken()
        }

        return events
    }
}

class LogGroupActor(
    project: Project,
    client: CloudWatchLogsClient,
    table: TableView<LogStream>,
    private val logGroup: String
) : LogActor<LogStream>(project, client, table) {
    override val emptyText = message("cloudwatch.logs.no_log_streams")
    override val tableErrorMessage = message("cloudwatch.logs.failed_to_load_streams", logGroup)
    override val notFoundText = message("cloudwatch.logs.log_group_does_not_exist", logGroup)

    override suspend fun loadInitial() {
        // With this order by we can't filter (API limitation), but it wouldn't make sense to order by name
        val request = DescribeLogStreamsRequest.builder()
            .logGroupName(logGroup)
            .descending(true)
            .orderBy(OrderBy.LAST_EVENT_TIME)
            .build()
        loadAndPopulate { getLogStreams(request) }
    }

    override suspend fun loadMore(nextToken: String?, saveForwardToken: Boolean, saveBackwardToken: Boolean): List<LogStream> {
        // loading backwards doesn't make sense in this context, so just skip the event
        if (saveBackwardToken) {
            return listOf()
        }

        val request = DescribeLogStreamsRequest.builder()
            .logGroupName(logGroup)
            .nextToken(nextToken)
            .descending(true)
            .orderBy(OrderBy.LAST_EVENT_TIME)
            .build()

        return getLogStreams(request)
    }

    private fun getLogStreams(request: DescribeLogStreamsRequest): List<LogStream> {
        val response = client.describeLogStreams(request)
        val events = response.logStreams().filterNotNull()
        nextForwardToken = response.nextToken()

        return events
    }
}

class LogGroupSearchActor(
    project: Project,
    client: CloudWatchLogsClient,
    table: TableView<LogStream>,
    private val logGroup: String
) : LogActor<LogStream>(project, client, table) {
    override val emptyText = message("cloudwatch.logs.no_log_streams")
    override val tableErrorMessage = message("cloudwatch.logs.failed_to_load_streams", logGroup)
    override val notFoundText = message("cloudwatch.logs.log_group_does_not_exist", logGroup)

    override suspend fun loadInitialFilter(queryString: String) {
        val request = DescribeLogStreamsRequest.builder()
            .logGroupName(logGroup)
            .descending(true)
            .orderBy(OrderBy.LOG_STREAM_NAME)
            .logStreamNamePrefix(queryString)
            .build()
        loadAndPopulate { getLogStreams(request) }
    }

    override suspend fun loadMore(nextToken: String?, saveForwardToken: Boolean, saveBackwardToken: Boolean): List<LogStream> {
        // loading backwards doesn't make sense in this context, so just skip the event
        if (saveBackwardToken) {
            return listOf()
        }

        val request = DescribeLogStreamsRequest.builder()
            .logGroupName(logGroup)
            .nextToken(nextToken)
            .descending(true)
            .orderBy(OrderBy.LOG_STREAM_NAME)
            .build()

        return getLogStreams(request)
    }

    private fun getLogStreams(request: DescribeLogStreamsRequest): List<LogStream> {
        val response = client.describeLogStreams(request)
        val events = response.logStreams().filterNotNull()
        nextForwardToken = response.nextToken()

        return events
    }
}
