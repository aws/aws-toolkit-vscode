// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.openapi.wm.ex.ToolWindowEx
import software.aws.toolkits.core.credentials.ToolkitCredentialsProvider
import software.aws.toolkits.core.region.AwsRegion
import software.aws.toolkits.jetbrains.core.ChangeAccountSettingsAction
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager
import software.aws.toolkits.resources.message

@Suppress("unused")
class AwsExplorerFactory : ToolWindowFactory, DumbAware {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val explorer = ExplorerToolWindow(project)
        toolWindow.component.parent.add(explorer)
        if (toolWindow is ToolWindowEx) {
            toolWindow.setTitleActions(
                object : DumbAwareAction(message("explorer.refresh.title"), message("explorer.refresh.description"), AllIcons.Actions.Refresh) {
                    override fun actionPerformed(e: AnActionEvent) {
                        explorer.updateModel()
                    }
                })
            toolWindow.setAdditionalGearActions(AwsSettingsMenu(project))
        }
    }

    override fun init(toolWindow: ToolWindow) {
        toolWindow.stripeTitle = message("explorer.label")
    }
}

class AwsSettingsMenu(private val project: Project) : DefaultActionGroup(message("settings.title"), true),
    ProjectAccountSettingsManager.AccountSettingsChangedNotifier {
    init {
        project.messageBus.connect().subscribe(ProjectAccountSettingsManager.ACCOUNT_SETTINGS_CHANGED, this)
        add(ChangeAccountSettingsAction(project).createPopupActionGroup())
    }

    override fun activeCredentialsChanged(credentialsProvider: ToolkitCredentialsProvider) {
        clearAndReAddActions()
    }

    override fun activeRegionChanged(value: AwsRegion) {
        clearAndReAddActions()
    }

    private fun clearAndReAddActions() {
        removeAll()
        add(ChangeAccountSettingsAction(project).createPopupActionGroup())
    }
}