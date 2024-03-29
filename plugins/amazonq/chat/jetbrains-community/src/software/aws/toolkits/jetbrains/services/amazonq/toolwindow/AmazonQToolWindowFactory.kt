// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.amazonq.toolwindow

import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import software.aws.toolkits.jetbrains.services.amazonq.isQSupportedInThisVersion
import software.aws.toolkits.jetbrains.utils.isRunningOnRemoteBackend
import software.aws.toolkits.resources.message

class AmazonQToolWindowFactory : ToolWindowFactory, DumbAware {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val contentManager = toolWindow.contentManager
        val content = contentManager.factory.createContent(AmazonQToolWindow.getInstance(project).component, null, false).also {
            it.isCloseable = true
            it.isPinnable = true
        }
        contentManager.addContent(content)
        toolWindow.activate(null)
        contentManager.setSelectedContent(content)
    }

    override fun init(toolWindow: ToolWindow) {
        toolWindow.stripeTitle = message("q.window.title")
    }

    override fun shouldBeAvailable(project: Project): Boolean = !isRunningOnRemoteBackend() && isQSupportedInThisVersion()

    companion object {
        const val WINDOW_ID = AMAZON_Q_WINDOW_ID
    }
}
