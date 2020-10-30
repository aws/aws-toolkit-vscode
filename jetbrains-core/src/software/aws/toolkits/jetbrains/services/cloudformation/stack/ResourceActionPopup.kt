// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudformation.stack

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.project.DumbAware
import com.intellij.ui.PopupHandler
import software.aws.toolkits.resources.message
import java.awt.Component
import java.awt.datatransfer.StringSelection

internal class ResourceActionPopup(private val selected: () -> SelectedResource?) : PopupHandler() {
    private val actionManager = ActionManager.getInstance()
    override fun invokePopup(comp: Component?, x: Int, y: Int) {
        val selected = selected() ?: return
        val actionGroup = DefaultActionGroup(
            listOf(
                CopyAction(message("cloudformation.stack.logical_id.copy"), selected.logicalId),
                CopyAction(message("cloudformation.stack.physical_id.copy"), selected.physicalId)
            )
        )
        val popupMenu = actionManager.createActionPopupMenu(STACK_TOOL_WINDOW.id, actionGroup)
        popupMenu.component.show(comp, x, y)
    }
}

private class CopyAction(name: String, private val value: String?) : AnAction(name, null, AllIcons.Actions.Copy), DumbAware {

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabledAndVisible = value != null
    }

    override fun actionPerformed(e: AnActionEvent) {
        CopyPasteManager.getInstance().setContents(StringSelection(value))
    }
}

internal data class SelectedResource(internal val logicalId: String, internal val physicalId: String?)
