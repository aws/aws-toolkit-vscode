// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.sqs.toolwindow

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.openapi.wm.ToolWindowManager
import software.aws.toolkits.resources.message

class SqsWindowFactory : ToolWindowFactory, DumbAware {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        // No content, it will be shown when queues are viewed
        runInEdt {
            toolWindow.installWatcher(toolWindow.contentManager)
        }
    }

    override fun init(toolWindow: ToolWindow) {
        toolWindow.stripeTitle = message("sqs.toolwindow")
    }

    override fun shouldBeAvailable(project: Project): Boolean = false

    companion object {
        private const val TOOL_WINDOW_ID = "aws.sqs"

        fun getToolWindow(project: Project) = ToolWindowManager.getInstance(project).getToolWindow(TOOL_WINDOW_ID)
            ?: throw IllegalStateException("Can't find tool window $TOOL_WINDOW_ID")
    }
}
