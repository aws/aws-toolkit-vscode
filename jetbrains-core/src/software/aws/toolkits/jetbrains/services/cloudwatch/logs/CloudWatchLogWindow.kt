// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs

import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.project.Project
import com.intellij.util.text.DateFormatUtil
import icons.AwsIcons
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.toolwindow.ToolkitToolWindowManager
import software.aws.toolkits.jetbrains.core.toolwindow.ToolkitToolWindowType
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor.CloudWatchLogGroup
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor.CloudWatchLogStream
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.getCoroutineUiContext
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CloudwatchlogsTelemetry
import software.aws.toolkits.telemetry.Result
import java.time.Duration

class CloudWatchLogWindow(private val project: Project) : CoroutineScope by ApplicationThreadPoolScope("openLogGroup") {
    private val toolWindow = ToolkitToolWindowManager.getInstance(project, CW_LOGS_TOOL_WINDOW)
    private val edtContext = getCoroutineUiContext()

    fun showLogGroup(logGroup: String) = launch {
        var result = Result.Succeeded
        try {
            val existingWindow = toolWindow.find(logGroup)
            if (existingWindow != null) {
                withContext(edtContext) {
                    existingWindow.show()
                }
                return@launch
            }
            val group = CloudWatchLogGroup(project, logGroup)
            val title = message("cloudwatch.logs.log_group_title", logGroup.split("/").last())
            withContext(edtContext) {
                toolWindow.addTab(title, group.content, activate = true, id = logGroup, disposable = group)
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
        duration: Duration? = null
    ) = launch {
        var result = Result.Succeeded
        try {
            val id = "$logGroup/$logStream/${previousEvent?.timestamp}/${previousEvent?.message}/$duration"
            val existingWindow = toolWindow.find(id)
            if (existingWindow != null) {
                withContext(edtContext) {
                    existingWindow.show()
                }
                return@launch
            }
            val title = if (previousEvent != null && duration != null) {
                message(
                    "cloudwatch.logs.filtered_log_stream_title", logStream,
                    DateFormatUtil.getDateTimeFormat().format(previousEvent.timestamp - duration.toMillis()),
                    DateFormatUtil.getDateTimeFormat().format(previousEvent.timestamp + duration.toMillis())
                )
            } else {
                message("cloudwatch.logs.log_stream_title", logStream)
            }
            val stream = CloudWatchLogStream(project, logGroup, logStream, previousEvent, duration)
            withContext(edtContext) {
                toolWindow.addTab(title, stream.content, activate = true, id = id, disposable = stream)
            }
        } catch (e: Exception) {
            LOG.error(e) { "Exception thrown while trying to show log group '$logGroup' stream '$logStream'" }
            result = Result.Failed
            throw e
        } finally {
            CloudwatchlogsTelemetry.openStream(project, result)
        }
    }

    fun closeLogGroup(logGroup: String) = launch {
        toolWindow.findPrefix(logGroup).forEach {
            withContext(edtContext) {
                it.dispose()
            }
        }
    }

    companion object {
        internal val CW_LOGS_TOOL_WINDOW = ToolkitToolWindowType(
            "AWS.CloudWatchLog",
            message("cloudwatch.logs.toolwindow"),
            AwsIcons.Resources.CloudWatch.LOGS_TOOL_WINDOW
        )

        fun getInstance(project: Project) = ServiceManager.getService(project, CloudWatchLogWindow::class.java)
        private val LOG = getLogger<CloudWatchLogWindow>()
    }
}
