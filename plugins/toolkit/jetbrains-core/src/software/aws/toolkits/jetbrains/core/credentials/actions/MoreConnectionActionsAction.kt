// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.actions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.ActionGroup
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.popup.JBPopupFactory
import software.aws.toolkits.jetbrains.core.credentials.AwsConnectionManagerConnection
import software.aws.toolkits.jetbrains.core.credentials.ConnectionSettingsMenuBuilder.Companion.connectionSettingsMenuBuilder
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.lazyGetUnauthedBearerConnections
import software.aws.toolkits.resources.message

class MoreConnectionActionsAction : DumbAwareAction(AllIcons.Actions.MoreHorizontal) {
    override fun getActionUpdateThread() = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        e.presentation.icon = if (lazyGetUnauthedBearerConnections().isEmpty()) AllIcons.Actions.MoreHorizontal else AllIcons.General.Warning
    }

    fun buildActions(project: Project?): ActionGroup {
        val actionManager = ActionManager.getInstance()
        val baseActions = actionManager.getAction("aws.toolkit.toolwindow.credentials.rightGroup.more.group") as ActionGroup
        val identityActions = connectionSettingsMenuBuilder().apply { withIndividualIdentityActions(project) }.build()

        return DefaultActionGroup(
            buildList {
                add(identityActions)

                project?.let { project ->
                    if (ToolkitConnectionManager.getInstance(project).activeConnection() is AwsConnectionManagerConnection) {
                        add(actionManager.getAction("aws.settings.upsertCredentials"))
                    }
                }

                add(baseActions)
            }
        )
    }

    override fun actionPerformed(e: AnActionEvent) {
        val actions = buildActions(e.project)

        JBPopupFactory.getInstance().createActionGroupPopup(
            message("settings.title"),
            actions,
            e.dataContext,
            JBPopupFactory.ActionSelectionAid.SPEEDSEARCH,
            true
        ).showInBestPositionFor(e.dataContext)
    }
}
