// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.actionSystem.Separator
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.openapi.wm.ex.ToolWindowEx
import software.aws.toolkits.jetbrains.core.help.HelpIds
import software.aws.toolkits.jetbrains.ui.feedback.FeedbackDialog
import software.aws.toolkits.jetbrains.utils.actions.OpenBrowserAction
import software.aws.toolkits.resources.message

class AwsExplorerFactory : ToolWindowFactory, DumbAware {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val explorer = ExplorerToolWindow.getInstance(project)
        val contentManager = toolWindow.contentManager
        val content = contentManager.factory.createContent(explorer, null, false)
        contentManager.addContent(content)

        toolWindow.helpId = HelpIds.EXPLORER_WINDOW.id
        if (toolWindow is ToolWindowEx) {
            val actionManager = ActionManager.getInstance()
            toolWindow.setTitleActions(
                actionManager.getAction("aws.settings.refresh"),
                Separator.create(),
                FeedbackDialog.getAction(project)
            )
            toolWindow.setAdditionalGearActions(
                DefaultActionGroup().apply {
                    add(
                        OpenBrowserAction(
                            title = message("explorer.view_documentation"),
                            url = "https://docs.aws.amazon.com/console/toolkit-for-jetbrains"
                        )
                    )
                    add(
                        OpenBrowserAction(
                            title = message("explorer.view_source"),
                            icon = AllIcons.Vcs.Vendors.Github,
                            url = "https://github.com/aws/aws-toolkit-jetbrains"
                        )
                    )
                    add(
                        OpenBrowserAction(
                            title = message("explorer.create_new_issue"),
                            icon = AllIcons.Vcs.Vendors.Github,
                            url = "https://github.com/aws/aws-toolkit-jetbrains/issues/new/choose"
                        )
                    )
                    add(FeedbackDialog.getAction(project))
                    add(actionManager.getAction("aws.settings.show"))
                }
            )
        }
    }

    override fun init(toolWindow: ToolWindow) {
        toolWindow.stripeTitle = message("explorer.label")
    }
}
