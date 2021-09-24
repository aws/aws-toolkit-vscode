// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.util.text.DateFormatUtil
import icons.AwsIcons
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.coroutines.getCoroutineUiContext
import software.aws.toolkits.jetbrains.core.toolwindow.ToolkitToolWindowManager
import software.aws.toolkits.jetbrains.core.toolwindow.ToolkitToolWindowType
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor.CloudWatchLogGroup
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor.CloudWatchLogStream
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights.DetailedLogRecord
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights.QueryDetails
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights.QueryResultPanel
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CloudwatchlogsTelemetry
import software.aws.toolkits.telemetry.Result
import java.time.Duration

class CloudWatchLogWindow(private val project: Project) {
    private val toolWindow = ToolkitToolWindowManager.getInstance(project, CW_LOGS_TOOL_WINDOW)
    private val edtContext = getCoroutineUiContext()

    fun showLogGroup(logGroup: String) {
        var result = Result.Succeeded
        try {
            if (showWindow(logGroup)) {
                return
            }
            val group = CloudWatchLogGroup(project, logGroup)
            val title = message("cloudwatch.logs.log_group_title", logGroup.split("/").last())
            runInEdt {
                toolWindow.addTab(title, group.content, activate = true, id = logGroup, disposable = group, refresh = { group.refreshTable() })
            }
        } catch (e: Exception) {
            LOG.error(e) { "Exception thrown while trying to show log group '$logGroup'" }
            result = Result.Failed
            throw e
        } finally {
            CloudwatchlogsTelemetry.openGroup(project, result)
        }
    }

    fun showLogStream(
        logGroup: String,
        logStream: String,
        previousEvent: LogStreamEntry? = null,
        duration: Duration? = null,
        streamLogs: Boolean = false
    ) {
        var result = Result.Succeeded
        try {
            val id = "$logGroup/$logStream/${previousEvent?.timestamp}/${previousEvent?.message}/$duration"
            if (showWindow(id)) {
                return
            }
            val title = if (previousEvent != null && duration != null) {
                message(
                    "cloudwatch.logs.filtered_log_stream_title",
                    logStream,
                    DateFormatUtil.getDateTimeFormat().format(previousEvent.timestamp - duration.toMillis()),
                    DateFormatUtil.getDateTimeFormat().format(previousEvent.timestamp + duration.toMillis())
                )
            } else {
                message("cloudwatch.logs.log_stream_title", logStream)
            }
            val stream = CloudWatchLogStream(project, logGroup, logStream, previousEvent, duration, streamLogs)
            runInEdt {
                toolWindow.addTab(title, stream.content, activate = true, id = id, disposable = stream, refresh = { stream.refreshTable() })
            }
        } catch (e: Exception) {
            LOG.error(e) { "Exception thrown while trying to show log group '$logGroup' stream '$logStream'" }
            result = Result.Failed
            throw e
        } finally {
            CloudwatchlogsTelemetry.openStream(project, result)
        }
    }

    fun showQueryResults(queryDetails: QueryDetails, queryId: String, fields: List<String>) {
        if (showWindow(queryId)) {
            return
        }

        val panel = QueryResultPanel(project, fields, queryId, queryDetails)
        val title = message("cloudwatch.logs.query_tab_title", queryId)
        runInEdt {
            toolWindow.addTab(title, panel, activate = true, id = queryId, disposable = panel)
        }
    }

    fun showDetailedEvent(client: CloudWatchLogsClient, identifier: String) {
        if (showWindow(identifier)) {
            return
        }

        val detailedLogEvent = DetailedLogRecord(project, client, identifier)
        runInEdt {
            toolWindow.addTab(detailedLogEvent.title, detailedLogEvent.getComponent(), activate = true, id = identifier, disposable = detailedLogEvent)
        }
    }

    fun closeLogGroup(logGroup: String) {
        runInEdt {
            toolWindow.findPrefix(logGroup).forEach {
                it.dispose()
            }
        }
    }

    private fun showWindow(identifier: String): Boolean {
        val existingWindow = toolWindow.find(identifier)
        if (existingWindow != null) {
            runInEdt {
                existingWindow.show(refresh = true)
            }
            return true
        }
        return false
    }

    companion object {
        private val LOG = getLogger<CloudWatchLogWindow>()
        internal val CW_LOGS_TOOL_WINDOW = ToolkitToolWindowType(
            "AWS.CloudWatchLog",
            message("cloudwatch.logs.toolwindow"),
            AwsIcons.Resources.CloudWatch.LOGS_TOOL_WINDOW
        )

        fun getInstance(project: Project) = project.service<CloudWatchLogWindow>()
    }
}
