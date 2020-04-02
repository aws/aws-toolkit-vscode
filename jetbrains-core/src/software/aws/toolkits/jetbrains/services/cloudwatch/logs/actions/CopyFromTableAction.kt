// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.project.DumbAware
import com.intellij.ui.table.TableView
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.LogStreamEntry
import software.aws.toolkits.resources.message
import java.awt.datatransfer.StringSelection

// FIX_WHEN_MIN_IS_201 make anaction text dynamic based on table size
class CopyFromTableAction(private val table: TableView<LogStreamEntry>) :
    AnAction(message("cloudwatch.logs.copy_action", 1), null, AllIcons.Actions.Copy),
    DumbAware {
    override fun update(e: AnActionEvent) {
        e.presentation.text = message("cloudwatch.logs.copy_action", table.selectedRows.size)
    }

    override fun actionPerformed(e: AnActionEvent) {
        val copyPasteManager = CopyPasteManager.getInstance()
        // This emulates the copy that that comes from the jtable which is TSV. We could
        // pull the action out of the table but it would be more weird
        val selection = table.selectedRows.joinToString("\n") { row ->
            table.selectedColumns.joinToString("\t") { column ->
                table.getValueAt(row, column).toString().trim()
            }
        }
        copyPasteManager.setContents(StringSelection(selection))
    }
}
