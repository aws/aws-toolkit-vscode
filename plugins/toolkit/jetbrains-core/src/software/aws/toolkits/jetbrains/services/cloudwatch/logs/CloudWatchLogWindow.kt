// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.util.text.DateFormatUtil
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.toolwindow.ToolkitToolWindow
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor.CloudWatchLogGroup
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor.CloudWatchLogStream
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights.DetailedLogRecord
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights.QueryDetails
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights.QueryResultPanel
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.toolwindow.CloudWatchLogsToolWindowFactory
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CloudWatchResourceType
import software.aws.toolkits.telemetry.CloudwatchlogsTelemetry
import software.aws.toolkits.telemetry.Result
import java.time.Duration

class CloudWatchLogWindow(override val project: Project) : ToolkitToolWindow {
    override val toolWindowId = CloudWatchLogsToolWindowFactory.TOOLWINDOW_ID

    fun showLogGroup(logGroup: String) {
        var result = Result.Succeeded
        runInEdt {
            try {
                if (!showExistingContent(logGroup)) {
                    val group = CloudWatchLogGroup(project, logGroup)
                    val title = message("cloudwatch.logs.log_group_title", logGroup.split("/").last())
                    addTab(title, group.content, activate = true, id = logGroup, additionalDisposable = group)
                }
            } catch (e: Exception) {
                LOG.error(e) { "Exception thrown while trying to show log group '$logGroup'" }
                result = Result.Failed
                throw e
            } finally {
                CloudwatchlogsTelemetry.open(project = project, result = result, cloudWatchResourceType = CloudWatchResourceType.LogGroup, source = "logGroup")
            }
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
            if (showExistingContent(id)) {
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
                addTab(title, stream.content, activate = true, id = id, additionalDisposable = stream)
            }
        } catch (e: Exception) {
            LOG.error(e) { "Exception thrown while trying to show log group '$logGroup' stream '$logStream'" }
            result = Result.Failed
            throw e
        } finally {
            CloudwatchlogsTelemetry.open(project = project, result = result, cloudWatchResourceType = CloudWatchResourceType.LogStream, source = "logStream")
        }
    }

    fun showQueryResults(queryDetails: QueryDetails, queryId: String, fields: List<String>) {
        if (showExistingContent(queryId)) {
            return
        }

        val panel = QueryResultPanel(project, fields, queryId, queryDetails)
        val title = message("cloudwatch.logs.query_tab_title", queryId)
        runInEdt {
            addTab(title, panel, activate = true, id = queryId)
        }
    }

    fun showDetailedEvent(client: CloudWatchLogsClient, identifier: String) {
        if (showExistingContent(identifier)) {
            return
        }

        val detailedLogEvent = DetailedLogRecord(project, client, identifier)
        runInEdt {
            addTab(detailedLogEvent.title, detailedLogEvent.getComponent(), activate = true, id = identifier, additionalDisposable = detailedLogEvent)
        }
    }

    fun closeLogGroup(logGroup: String) {
        findPrefix(logGroup).forEach {
            removeContent(it)
        }
    }

    companion object {
        private val LOG = getLogger<CloudWatchLogWindow>()
        fun getInstance(project: Project) = project.service<CloudWatchLogWindow>()
    }
}
