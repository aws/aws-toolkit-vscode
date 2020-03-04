// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.actionSystem.Separator
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.openapi.wm.ex.ToolWindowEx
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.core.credentials.ChangeAccountSettingsActionGroup
import software.aws.toolkits.jetbrains.core.help.HelpIds
import software.aws.toolkits.jetbrains.ui.feedback.FeedbackDialog
import software.aws.toolkits.jetbrains.utils.actions.OpenBrowserAction
import software.aws.toolkits.resources.message

@Suppress("unused")
class AwsExplorerFactory : ToolWindowFactory, DumbAware {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val explorer = ExplorerToolWindow.getInstance(project)
        toolWindow.component.parent.add(explorer)
        toolWindow.helpId = HelpIds.EXPLORER_WINDOW.id
        if (toolWindow is ToolWindowEx) {
            toolWindow.setTitleActions(
                // order from left to right
                object : DumbAwareAction(message("explorer.refresh.title"), message("explorer.refresh.description"), AllIcons.Actions.Refresh) {
                    override fun actionPerformed(e: AnActionEvent) {
                        AwsResourceCache.getInstance(project).clear()
                        explorer.invalidateTree()
                    }
                },
                Separator.create(),
                FeedbackDialog.getAction(project)
            )
            toolWindow.setAdditionalGearActions(
                DefaultActionGroup().apply {
                    add(
                        DefaultActionGroup(message("settings.title"), true).also {
                            it.add(ChangeAccountSettingsActionGroup(project, true))
                        }
                    )
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
                }
            )
        }
    }

    override fun init(toolWindow: ToolWindow) {
        toolWindow.stripeTitle = message("explorer.label")
    }
}
