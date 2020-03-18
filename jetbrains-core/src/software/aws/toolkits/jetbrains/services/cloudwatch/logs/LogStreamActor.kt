// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs

import com.intellij.openapi.Disposable
import com.intellij.ui.table.TableView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.future.asDeferred
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsAsyncClient
import software.amazon.awssdk.services.cloudwatchlogs.model.GetLogEventsRequest
import software.amazon.awssdk.services.cloudwatchlogs.model.OutputLogEvent
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.getCoroutineUiContext
import software.aws.toolkits.resources.message
import java.time.Duration

class LogStreamActor(
    private val client: CloudWatchLogsAsyncClient,
    private val table: TableView<OutputLogEvent>,
    private val logGroup: String,
    private val logStream: String
) : CoroutineScope by ApplicationThreadPoolScope("CloudWatchLogsStream"), Disposable {
    val channel = Channel<Messages>()
    private val edtContext = getCoroutineUiContext(disposable = this)

    private var nextBackwardToken: String? = null
    private var nextForwardToken: String? = null

    enum class Messages {
        LOAD_FORWARD,
        LOAD_BACKWARD
    }

    suspend fun loadInitial() {
        val request = GetLogEventsRequest
            .builder()
            .logGroupName(logGroup)
            .logStreamName(logStream)
            .startFromHead(true)
            .build()
        loadAndPopulate(request)
    }

    suspend fun loadInitialRange(startTime: Long, duration: Duration) {
        val request = GetLogEventsRequest
            .builder()
            .logGroupName(logGroup)
            .logStreamName(logStream)
            .startFromHead(true)
            .startTime(startTime - duration.toMillis())
            .endTime(startTime + duration.toMillis())
            .build()
        loadAndPopulate(request)
    }

    suspend fun startListening() = coroutineScope {
        launch {
            for (message in channel) {
                when (message) {
                    Messages.LOAD_FORWARD -> {
                        val items = loadMore(nextForwardToken, saveForwardToken = true)
                        withContext(edtContext) { table.listTableModel.addRows(items) }
                    }
                    Messages.LOAD_BACKWARD -> {
                        val items = loadMore(nextBackwardToken, saveBackwardToken = true)
                        withContext(edtContext) { table.listTableModel.items = items + table.listTableModel.items }
                    }
                }
            }
        }
    }

    private suspend fun loadAndPopulate(request: GetLogEventsRequest) {
        try {
            val items = load(request, saveForwardToken = true, saveBackwardToken = true)
            withContext(edtContext) {
                table.listTableModel.addRows(items)
            }
        } finally {
            withContext(edtContext) {
                table.emptyText.text = message("cloudwatch.logs.no_events")
                table.setPaintBusy(false)
            }
        }
    }

    private suspend fun loadMore(
        nextToken: String?,
        saveForwardToken: Boolean = false,
        saveBackwardToken: Boolean = false
    ): List<OutputLogEvent> {
        val request = GetLogEventsRequest
            .builder()
            .logGroupName(logGroup)
            .logStreamName(logStream)
            .startFromHead(true)
            .nextToken(nextToken)
            .build()

        return load(request, saveForwardToken = saveForwardToken, saveBackwardToken = saveBackwardToken)
    }

    private suspend fun load(
        request: GetLogEventsRequest,
        saveForwardToken: Boolean = false,
        saveBackwardToken: Boolean = false
    ): List<OutputLogEvent> {
        val response = client.getLogEvents(request).asDeferred().await()
        val events = response.events().filterNotNull()
        if (saveForwardToken) {
            nextForwardToken = response.nextForwardToken()
        }
        if (saveBackwardToken) {
            nextBackwardToken = response.nextBackwardToken()
        }

        return events
    }

    override fun dispose() {
        channel.close()
        cancel()
    }
}
