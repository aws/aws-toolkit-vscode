// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.actions

import com.intellij.ide.DataManager
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.Project
import software.aws.toolkits.jetbrains.core.explorer.devToolsTab.nodes.AbstractActionTreeNode
import java.awt.event.MouseEvent

class AnActionTreeNode(
    project: Project,
    private val place: String,
    private val action: AnAction
) : AbstractActionTreeNode(
    project,
    action.templatePresentation.text,
    action.templatePresentation.icon
) {
    override fun onDoubleClick(event: MouseEvent) {
        val e = AnActionEvent.createFromInputEvent(
            event,
            place,
            action.templatePresentation.clone(),
            DataManager.getInstance().getDataContext(event.component)
        )

        action.actionPerformed(e)
    }
}
