// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.sqs.actions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.ui.table.TableView
import software.amazon.awssdk.services.sqs.model.Message
import software.aws.toolkits.resources.message
import java.awt.datatransfer.StringSelection

class CopyMessageAction(private val table: TableView<Message>) : DumbAwareAction(message("sqs.copy.message", 1), null, AllIcons.Actions.Copy) {
    override fun update(e: AnActionEvent) {
        e.presentation.isEnabled = table.selectedObjects.size > 0
        e.presentation.text = message("sqs.copy.message", table.selectedObjects.size)
    }

    override fun actionPerformed(e: AnActionEvent) {
        // get an immutable view of the selected items
        val messages = table.selectedObjects.toList()
        if (messages.isEmpty()) {
            return
        }
        CopyPasteManager.getInstance().setContents(StringSelection(messages.joinToString("\n") { it.body() }))
    }
}
