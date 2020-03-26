// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.ToggleAction
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
        if (isSelected) {
            wrap()
        } else {
            unwrap()
        }
    }

    private fun wrap() {
        (getCurrentTableView().listTableModel.columnInfos[messageColumn] as? LogStreamMessageColumn)?.wrap()
        redrawTable()
    }

    private fun unwrap() {
        (getCurrentTableView().listTableModel.columnInfos[messageColumn] as? LogStreamMessageColumn)?.unwrap()
        redrawTable()
    }

    private fun redrawTable() {
        getCurrentTableView().listTableModel.fireTableDataChanged()
    }
}
