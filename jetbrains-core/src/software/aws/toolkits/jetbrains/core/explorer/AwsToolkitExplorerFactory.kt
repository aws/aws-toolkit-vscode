// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer

import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentManagerEvent
import com.intellij.ui.content.ContentManagerListener
import software.aws.toolkits.jetbrains.core.help.HelpIds
import software.aws.toolkits.resources.message

class AwsToolkitExplorerFactory : ToolWindowFactory, DumbAware {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        toolWindow.helpId = HelpIds.EXPLORER_WINDOW.id
        toolWindow.installWatcher(toolWindow.contentManager)
        val toolkitToolWindowListener = ToolkitToolWindowListener(project)
        toolWindow.contentManager.addContentManagerListener(object : ContentManagerListener {
            override fun selectionChanged(event: ContentManagerEvent) {
                super.selectionChanged(event)
                if (event.operation == ContentManagerEvent.ContentOperation.add) {
                    // TODO: Change to ID based tab detection
                    toolWindow.contentManager.selectedContent?.let { toolkitToolWindowListener.tabChanged(it.tabName) }
                }
            }
        })

        // content will be added to tool window in initialization of AwsToolkitExplorerToolWindow
        AwsToolkitExplorerToolWindow.getInstance(project)
    }
    override fun init(toolWindow: ToolWindow) {
        toolWindow.stripeTitle = message("aws.notification.title")
    }

    companion object {
        const val TOOLWINDOW_ID = "aws.toolkit.explorer"
    }
}
