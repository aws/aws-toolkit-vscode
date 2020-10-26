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
import java.util.function.Supplier

// FIX_WHEN_MIN_IS_202 this AnAction was added in the last 2020.1 eap so it's valid. Remove this warning
class CopyFromTableAction(private val table: TableView<LogStreamEntry>) :
    AnAction(Supplier { message("cloudwatch.logs.copy_action", table.selectedRows.size) }, AllIcons.Actions.Copy),
    DumbAware {

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
