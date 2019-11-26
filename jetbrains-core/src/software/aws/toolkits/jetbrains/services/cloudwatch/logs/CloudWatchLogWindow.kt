// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs

import com.intellij.execution.filters.TextConsoleBuilderFactory
import com.intellij.execution.ui.ConsoleViewContentType
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.project.Project
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.toolwindow.ToolkitToolWindowType
import software.aws.toolkits.jetbrains.core.toolwindow.ToolkitToolWindowManager
import software.aws.toolkits.resources.message

class CloudWatchLogWindow(private val project: Project) {
    private val toolWindow = ToolkitToolWindowManager.getInstance(project, CW_LOGS_TOOL_WINDOW)
    fun showLog(logGroup: String, logStream: String, fromHead: Boolean = true, title: String? = null) {
        val client = project.awsClient<CloudWatchLogsClient>()
        val console = TextConsoleBuilderFactory.getInstance().createBuilder(project).apply { setViewer(true) }.console
        val id = "$logGroup/$logStream"
        val displayName = title ?: id
        runInEdt {
            toolWindow.addTab(displayName, console.component, activate = true, id = id)
        }
        val events = client.getLogEventsPaginator { it.logGroupName(logGroup).logStreamName(logStream).startFromHead(fromHead) }.events()
        if (events.none()) {
            console.print(message("ecs.service.logs.empty", "$logGroup/$logStream\n"), ConsoleViewContentType.NORMAL_OUTPUT)
        } else {
            events.forEach { console.print("${it.message()}\n", ConsoleViewContentType.NORMAL_OUTPUT) }
        }
    }

    companion object {
        private val CW_LOGS_TOOL_WINDOW = ToolkitToolWindowType("AWS.CloudWatchLog", message("cloudwatch.log.toolwindow"))
        fun getInstance(project: Project) = ServiceManager.getService(project, CloudWatchLogWindow::class.java)
    }
}
