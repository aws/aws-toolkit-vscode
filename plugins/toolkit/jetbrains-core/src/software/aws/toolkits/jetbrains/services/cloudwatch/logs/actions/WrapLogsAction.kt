// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.ToggleAction
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.ui.table.TableView
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.LogStreamEntry
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor.LogStreamMessageColumn
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CloudwatchlogsTelemetry

class WrapLogsAction(private val project: Project, private val getCurrentTableView: () -> TableView<LogStreamEntry>) :
    ToggleAction(message("cloudwatch.logs.wrap"), null, AllIcons.Actions.ToggleSoftWrap),
    DumbAware {
    private val messageColumn = 1
    private var isSelected = false
    override fun isSelected(e: AnActionEvent): Boolean = isSelected

    override fun setSelected(e: AnActionEvent, state: Boolean) {
        CloudwatchlogsTelemetry.wrapEvents(project, enabled = state)
        isSelected = state
        val tableView = getCurrentTableView()
        if (isSelected) {
            wrap(tableView)
        } else {
            unwrap(tableView)
        }
    }

    private fun wrap(table: TableView<LogStreamEntry>) {
        // The ExpandableItemsHandler also unwraps the box even if word wrap is turned
        // on, so enable/disable it based on if we are wrapping or not
        table.setExpandableItemsEnabled(false)
        (table.listTableModel.columnInfos[messageColumn] as? LogStreamMessageColumn)?.wrap()
        table.redrawTable()
    }

    private fun unwrap(table: TableView<LogStreamEntry>) {
        table.setExpandableItemsEnabled(true)
        (table.listTableModel.columnInfos[messageColumn] as? LogStreamMessageColumn)?.unwrap()
        table.redrawTable()
    }

    private fun TableView<LogStreamEntry>.redrawTable() {
        val selection = selectedRows
        val row = rowAtPoint(visibleRect.location).takeIf { it >= 0 } ?: 0
        runInEdt {
            listTableModel.fireTableDataChanged()
            // maintain the top cell at the top
            scrollRectToVisible(getCellRect(row, 0, true))
            // reselect because fireTableDataChanged unselects. Selection can be non-contiguous
            selection.forEach {
                addRowSelectionInterval(it, it)
            }
        }
    }
}
