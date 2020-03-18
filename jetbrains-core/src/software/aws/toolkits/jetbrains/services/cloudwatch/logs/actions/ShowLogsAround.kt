// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.ActionGroup
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.PlatformDataKeys
import com.intellij.openapi.project.DumbAware
import com.intellij.ui.table.TableView
import software.amazon.awssdk.services.cloudwatchlogs.model.OutputLogEvent
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.CloudWatchLogWindow
import software.aws.toolkits.resources.message
import java.time.Duration

class ShowLogsAroundGroup(
    private val logGroup: String,
    private val logStream: String,
    private val treeTable: TableView<OutputLogEvent>
) : ActionGroup(message("cloudwatch.logs.show_logs_around"), null, AllIcons.Ide.Link), DumbAware {
    init {
        isPopup = true
    }

    override fun getChildren(e: AnActionEvent?): Array<AnAction> = arrayOf(
        ShowLogsAround(logGroup, logStream, treeTable, message("general.time.one_minute"), Duration.ofMinutes(1)),
        ShowLogsAround(logGroup, logStream, treeTable, message("general.time.five_minutes"), Duration.ofMinutes(5)),
        ShowLogsAround(logGroup, logStream, treeTable, message("general.time.ten_minutes"), Duration.ofMinutes(10))
    )
}

private class ShowLogsAround(
    private val logGroup: String,
    private val logStream: String,
    private val treeTable: TableView<OutputLogEvent>,
    time: String,
    private val duration: Duration
) :
    AnAction(time, null, null), DumbAware {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.getRequiredData(PlatformDataKeys.PROJECT)
        val window = CloudWatchLogWindow.getInstance(project)
        val selectedObject = treeTable.listTableModel.getItem(treeTable.selectedRow) ?: return
        window.showLogStream(logGroup, logStream, selectedObject.timestamp(), duration)
    }
}
