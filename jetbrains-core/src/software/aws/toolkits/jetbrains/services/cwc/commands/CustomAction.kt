// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cwc.commands

import com.intellij.openapi.actionSystem.ActionPlaces
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.wm.ToolWindowManager
import software.aws.toolkits.jetbrains.services.amazonq.toolwindow.AmazonQToolWindowFactory
import software.aws.toolkits.jetbrains.services.cwc.clients.chat.model.TriggerType

open class CustomAction(private val command: EditorContextCommand) : AnAction(), DumbAware {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.getData(CommonDataKeys.PROJECT) ?: return

        val toolWindowManager: ToolWindowManager = ToolWindowManager.getInstance(project)
        val toolWindowId = AmazonQToolWindowFactory.WINDOW_ID
        toolWindowManager.getToolWindow(toolWindowId)?.show()

        command.triggerType = when {
            ActionPlaces.isPopupPlace(e.place) -> TriggerType.ContextMenu
            ActionPlaces.isShortcutPlace(e.place) -> TriggerType.Hotkeys
            // TODO: track command palette trigger
            else -> TriggerType.ContextMenu
        }

        ActionRegistrar.instance.reportMessageClick(command)
    }
}
