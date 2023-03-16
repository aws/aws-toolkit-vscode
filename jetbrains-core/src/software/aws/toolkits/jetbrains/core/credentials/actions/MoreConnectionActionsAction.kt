// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials.actions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.ActionGroup
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.ui.popup.JBPopupFactory
import software.aws.toolkits.jetbrains.core.credentials.ConnectionSettingsMenuBuilder.Companion.connectionSettingsMenuBuilder
import software.aws.toolkits.jetbrains.core.credentials.lazyGetUnauthedBearerConnections
import software.aws.toolkits.resources.message

class MoreConnectionActionsAction : DumbAwareAction(AllIcons.Actions.MoreHorizontal) {
    override fun update(e: AnActionEvent) {
        e.presentation.icon = if (lazyGetUnauthedBearerConnections().isEmpty()) AllIcons.Actions.MoreHorizontal else AllIcons.General.Warning
    }

    override fun actionPerformed(e: AnActionEvent) {
        val baseActions = ActionManager.getInstance().getAction("aws.toolkit.toolwindow.credentials.rightGroup.more.group") as ActionGroup
        val identityActions = connectionSettingsMenuBuilder().apply { withIndividualIdentityActions(e.project) }.build()

        JBPopupFactory.getInstance().createActionGroupPopup(
            message("settings.title"),
            DefaultActionGroup(identityActions, baseActions),
            e.dataContext,
            JBPopupFactory.ActionSelectionAid.SPEEDSEARCH,
            true
        ).showInBestPositionFor(e.dataContext)
    }
}
