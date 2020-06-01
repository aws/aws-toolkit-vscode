// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor

import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionPlaces
import com.intellij.openapi.actionSystem.Constraints
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.project.Project
import com.intellij.ui.DoubleClickListener
import com.intellij.ui.PopupHandler
import com.intellij.ui.ScrollPaneFactory
import com.intellij.ui.TableSpeedSearch
import com.intellij.ui.table.JBTable
import com.intellij.ui.table.TableView
import com.intellij.util.ui.ListTableModel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.amazon.awssdk.services.cloudwatchlogs.model.LogStream
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.CloudWatchLogWindow
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.LogActor
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.LogGroupActor
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.LogGroupSearchActor
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions.ExportActionGroup
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.ui.bottomReached
import software.aws.toolkits.resources.message
import java.awt.event.KeyAdapter
import java.awt.event.KeyEvent
import java.awt.event.MouseEvent
import javax.swing.JComponent

class LogGroupTable(
    private val project: Project,
    private val client: CloudWatchLogsClient,
    private val logGroup: String,
    type: TableType
) : CoroutineScope by ApplicationThreadPoolScope("LogGroupTable"), Disposable {
    val component: JComponent
    val channel: Channel<LogActor.Message>
    private val groupTable: TableView<LogStream>
    private val logGroupActor: LogActor<LogStream>

    enum class TableType {
        LIST,
        FILTER
    }

    init {
        val tableModel = ListTableModel(
            arrayOf(LogStreamsStreamColumn(), LogStreamsDateColumn()),
            mutableListOf<LogStream>()
        )
        groupTable = TableView(tableModel).apply {
            setPaintBusy(true)
            autoscrolls = true
            emptyText.text = message("loading_resource.loading")
            tableHeader.reorderingAllowed = false
            tableHeader.resizingAllowed = false
        }
        groupTable.rowSorter = when (type) {
            TableType.LIST -> LogGroupTableSorter(tableModel)
            TableType.FILTER -> LogGroupFilterTableSorter(tableModel)
        }
        TableSpeedSearch(groupTable)
        addTableMouseListener(groupTable)
        addKeyListener(groupTable)
        addActions(groupTable)

        logGroupActor = when (type) {
            TableType.LIST -> LogGroupActor(project, client, groupTable, logGroup)
            TableType.FILTER -> LogGroupSearchActor(project, client, groupTable, logGroup)
        }

        channel = logGroupActor.channel

        component = ScrollPaneFactory.createScrollPane(groupTable).also {
            it.bottomReached {
                if (groupTable.rowCount != 0) {
                    launch { logGroupActor.channel.send(LogActor.Message.LoadForward) }
                }
            }
        }
    }

    private fun addKeyListener(table: JBTable) {
        table.addKeyListener(object : KeyAdapter() {
            override fun keyTyped(e: KeyEvent) {
                val logStream = table.getSelectedRowLogStream() ?: return
                if (!e.isConsumed && e.keyCode == KeyEvent.VK_ENTER) {
                    e.consume()
                    val window = CloudWatchLogWindow.getInstance(project)
                    window.showLogStream(logGroup, logStream)
                }
            }
        })
    }

    private fun addTableMouseListener(table: JBTable) {
        object : DoubleClickListener() {
            override fun onDoubleClick(e: MouseEvent?): Boolean {
                e ?: return false
                val logStream = table.getSelectedRowLogStream() ?: return false
                val window = CloudWatchLogWindow.getInstance(project)
                window.showLogStream(logGroup, logStream)
                return true
            }
        }.installOn(table)
    }

    private fun addActions(table: JBTable) {
        val actionGroup = DefaultActionGroup()
        actionGroup.addAction(ExportActionGroup(project, client, logGroup) {
            val row = groupTable.selectedRow.takeIf { it >= 0 } ?: return@ExportActionGroup null
            table.getValueAt(row, 0) as? String
        }, Constraints.FIRST)
        PopupHandler.installPopupHandler(
            table,
            actionGroup,
            ActionPlaces.EDITOR_POPUP,
            ActionManager.getInstance()
        )
    }

    private fun JBTable.getSelectedRowLogStream(): String? {
        val row = selectedRow.takeIf { it >= 0 } ?: return null
        return getValueAt(row, 0) as? String
    }

    override fun dispose() {}
}
