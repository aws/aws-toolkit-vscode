// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.openapi.wm.ex.ToolWindowEx
import software.aws.toolkits.resources.message

@Suppress("unused")
class AwsExplorerFactory : ToolWindowFactory, DumbAware {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val explorer = ExplorerToolWindow(project)
        toolWindow.component.parent.add(explorer)
        if (toolWindow is ToolWindowEx) {
            toolWindow.setTitleActions(
                object : DumbAwareAction(message("explorer.refresh.title"), message("explorer.refresh.description"), AllIcons.Actions.Refresh) {
                    override fun actionPerformed(e: AnActionEvent?) {
                        explorer.updateModel()
                    }
                })
        }
    }

    override fun init(toolWindow: ToolWindow) {
        toolWindow.stripeTitle = message("explorer.label")
    }
}