// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs

import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.project.Project
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import software.aws.toolkits.jetbrains.core.toolwindow.ToolkitToolWindowManager
import software.aws.toolkits.jetbrains.core.toolwindow.ToolkitToolWindowType
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor.CloudWatchLogGroup
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor.CloudWatchLogStream
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.getCoroutineUiContext
import software.aws.toolkits.resources.message
import java.time.Duration

class CloudWatchLogWindow(private val project: Project) : CoroutineScope by ApplicationThreadPoolScope("openLogGroup") {
    private val toolWindow = ToolkitToolWindowManager.getInstance(project, CW_LOGS_TOOL_WINDOW)
    private val edtContext = getCoroutineUiContext()

    fun showLogGroup(logGroup: String) = launch {
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
    }

    fun showLogStream(
        logGroup: String,
        logStream: String,
        startTime: Long? = null,
        duration: Duration? = null
    ) = launch {
        val id = "$logGroup/$logStream"
        // dispose existing window if it exists to update. TODO add a refresh, duh
        val existingWindow = toolWindow.find(id)
        if (existingWindow != null) {
            withContext(edtContext) {
                existingWindow.dispose()
            }
        }
        val title = message("cloudwatch.logs.log_stream_title", logStream)
        val stream = CloudWatchLogStream(project, logGroup, logStream, startTime, duration)
        withContext(edtContext) {
            toolWindow.addTab(title, stream.content, activate = true, id = id, disposable = stream)
        }
    }

    companion object {
        private val CW_LOGS_TOOL_WINDOW = ToolkitToolWindowType("AWS.CloudWatchLog", message("cloudwatch.logs.toolwindow"))
        fun getInstance(project: Project) = ServiceManager.getService(project, CloudWatchLogWindow::class.java)
    }
}
