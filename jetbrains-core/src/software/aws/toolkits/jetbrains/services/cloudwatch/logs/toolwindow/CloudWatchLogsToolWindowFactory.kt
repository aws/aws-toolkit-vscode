// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.toolwindow

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import software.aws.toolkits.resources.message

class CloudWatchLogsToolWindowFactory : ToolWindowFactory, DumbAware {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        runInEdt {
            toolWindow.installWatcher(toolWindow.contentManager)
        }
    }

    override fun init(toolWindow: ToolWindow) {
        toolWindow.stripeTitle = message("cloudwatch.logs.toolwindow")
    }

    override fun shouldBeAvailable(project: Project): Boolean = false

    companion object {
        const val TOOLWINDOW_ID = "aws.cloudwatchlogs"
    }
}
