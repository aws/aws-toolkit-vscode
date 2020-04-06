// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions

import com.intellij.openapi.actionSystem.ActionGroup
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.PlatformDataKeys
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.ui.table.TableView
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.CloudWatchLogWindow
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.LogStreamEntry
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CloudwatchlogsTelemetry
import java.time.Duration

class ShowLogsAroundActionGroup(
    private val project: Project,
    private val logGroup: String,
    private val logStream: String,
    private val treeTable: TableView<LogStreamEntry>
) : ActionGroup(message("cloudwatch.logs.show_logs_around"), null, null), DumbAware {
    init {
        isPopup = true
    }

    override fun getChildren(e: AnActionEvent?): Array<AnAction> = arrayOf(
        ShowLogsAround(project, logGroup, logStream, treeTable, message("general.time.one_minute"), Duration.ofMinutes(1)),
        ShowLogsAround(project, logGroup, logStream, treeTable, message("general.time.five_minutes"), Duration.ofMinutes(5)),
        ShowLogsAround(project, logGroup, logStream, treeTable, message("general.time.ten_minutes"), Duration.ofMinutes(10))
    )
}

private class ShowLogsAround(
    private val project: Project,
    private val logGroup: String,
    private val logStream: String,
    private val treeTable: TableView<LogStreamEntry>,
    timeMessage: String,
    private val duration: Duration
) : AnAction(timeMessage, null, null), DumbAware {
    override fun actionPerformed(e: AnActionEvent) {
        CloudwatchlogsTelemetry.showEventsAround(project, success = true, value = duration.toMillis().toDouble())
        val project = e.getRequiredData(PlatformDataKeys.PROJECT)
        val window = CloudWatchLogWindow.getInstance(project)
        val selectedRow = treeTable.selectedRow
        if (selectedRow >= treeTable.listTableModel.rowCount || selectedRow < 0) {
            return
        }
        val selectedObject = treeTable.listTableModel.getItem(selectedRow) ?: return
        window.showLogStream(logGroup, logStream, selectedObject, duration)
    }
}
