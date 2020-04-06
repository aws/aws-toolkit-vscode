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
import software.amazon.awssdk.services.cloudwatchlogs.model.FilterLogEventsRequest
import software.amazon.awssdk.services.cloudwatchlogs.model.GetLogEventsRequest
import software.amazon.awssdk.services.cloudwatchlogs.model.ResourceNotFoundException
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.getCoroutineUiContext
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import java.time.Duration

sealed class LogStreamActor(
    private val project: Project,
    protected val client: CloudWatchLogsClient,
    private val table: TableView<LogStreamEntry>,
    protected val logGroup: String,
    protected val logStream: String
) : CoroutineScope by ApplicationThreadPoolScope("CloudWatchLogsStream"), Disposable {
    val channel = Channel<Message>()
    private val tableErrorMessage = message("cloudwatch.logs.failed_to_load_stream", logStream)

    protected var nextBackwardToken: String? = null
    protected var nextForwardToken: String? = null
    protected abstract val emptyText: String

    private val edtContext = getCoroutineUiContext(disposable = this@LogStreamActor)
    private val exceptionHandler = CoroutineExceptionHandler { _, e ->
        LOG.error(e) { "Exception thrown in the LogStreamActor not handled:" }
        notifyError(title = message("general.unknown_error"), project = project)
        table.setPaintBusy(false)
        Disposer.dispose(this)
    }

    sealed class Message {
        class LOAD_INITIAL : Message()
        class LOAD_INITIAL_RANGE(val previousEvent: LogStreamEntry, val duration: Duration) : Message()
        class LOAD_INITIAL_FILTER(val queryString: String) : Message()
        class LOAD_FORWARD : Message()
        class LOAD_BACKWARD : Message()
    }

    init {
        launch(exceptionHandler) {
            handleMessages()
        }
    }

    private suspend fun handleMessages() {
        for (message in channel) {
            when (message) {
                is Message.LOAD_FORWARD -> if (!nextForwardToken.isNullOrEmpty()) {
                    withContext(edtContext) { table.setPaintBusy(true) }
                    val items = loadMore(nextForwardToken, saveForwardToken = true)
                    withContext(edtContext) {
                        table.listTableModel.addRows(items)
                        table.setPaintBusy(false)
                    }
                }
                is Message.LOAD_BACKWARD -> if (!nextBackwardToken.isNullOrEmpty()) {
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
                is Message.LOAD_INITIAL -> {
                    loadInitial()
                    // make sure the scroll pane is at the top after loading. Needed for Refresh!
                    val rect = table.getCellRect(0, 0, true)
                    withContext(edtContext) {
                        table.scrollRectToVisible(rect)
                    }
                }
                is Message.LOAD_INITIAL_RANGE -> {
                    loadInitialRange(message.previousEvent.timestamp, message.duration)
                    val item = table.listTableModel.items.firstOrNull { it == message.previousEvent }
                    val index = table.listTableModel.indexOf(item).takeIf { it > 0 } ?: return
                    withContext(edtContext) {
                        table.setRowSelectionInterval(index, index)
                        TableUtil.scrollSelectionToVisible(table)
                    }
                }
                is Message.LOAD_INITIAL_FILTER -> {
                    loadInitialFilter(message.queryString)
                }
            }
        }
    }

    protected suspend fun loadAndPopulate(loadBlock: suspend () -> List<LogStreamEntry>) {
        try {
            tableLoading()
            val items = loadBlock()
            table.listTableModel.items = items
            table.emptyText.text = emptyText
        } catch (e: ResourceNotFoundException) {
            withContext(edtContext) {
                table.emptyText.text = message("cloudwatch.logs.log_stream_does_not_exist", logStream)
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

    protected abstract suspend fun loadInitial()
    protected abstract suspend fun loadInitialRange(startTime: Long, duration: Duration)
    protected abstract suspend fun loadInitialFilter(queryString: String)
    protected abstract suspend fun loadMore(nextToken: String?, saveForwardToken: Boolean = false, saveBackwardToken: Boolean = false): List<LogStreamEntry>

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
        private val LOG = getLogger<LogStreamActor>()
    }
}

class LogStreamFilterActor(
    project: Project,
    client: CloudWatchLogsClient,
    table: TableView<LogStreamEntry>,
    logGroup: String,
    logStream: String
) : LogStreamActor(project, client, table, logGroup, logStream) {
    override val emptyText = message("cloudwatch.logs.no_events_query", logStream)

    override suspend fun loadInitial() {
        throw IllegalStateException("FilterActor can only loadInitialFilter")
    }

    override suspend fun loadInitialFilter(queryString: String) {
        val request = FilterLogEventsRequest
            .builder()
            .logGroupName(logGroup)
            .logStreamNames(logStream)
            .filterPattern(queryString)
            .build()
        loadAndPopulate { getSearchLogEvents(request) }
    }

    override suspend fun loadInitialRange(startTime: Long, duration: Duration) {
        throw IllegalStateException("FilterActor can only loadInitialFilter")
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
    logGroup: String,
    logStream: String
) :
    LogStreamActor(project, client, table, logGroup, logStream) {
    override val emptyText = message("cloudwatch.logs.no_events")
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

    override suspend fun loadInitialFilter(queryString: String) {
        throw IllegalStateException("GetActor can not loadInitialFilter")
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
