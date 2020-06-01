// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor

import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionPlaces
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.actionSystem.Separator
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.ui.PopupHandler
import com.intellij.ui.ScrollPaneFactory
import com.intellij.ui.TableSpeedSearch
import com.intellij.ui.table.TableView
import com.intellij.util.ui.ListTableModel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.LogActor
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.LogStreamEntry
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.LogStreamFilterActor
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.LogStreamListActor
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions.CopyFromTableAction
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions.ShowLogsAroundActionGroup
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.ui.bottomReached
import software.aws.toolkits.jetbrains.utils.ui.topReached
import software.aws.toolkits.resources.message
import javax.swing.JComponent
import javax.swing.JTable
import javax.swing.SortOrder

class LogStreamTable(
    val project: Project,
    client: CloudWatchLogsClient,
    private val logGroup: String,
    private val logStream: String,
    type: TableType
) : CoroutineScope by ApplicationThreadPoolScope("LogStreamTable"), Disposable {

    enum class TableType {
        LIST,
        FILTER
    }

    val component: JComponent
    val channel: Channel<LogActor.Message>
    val logsTable: TableView<LogStreamEntry>
    private val logStreamActor: LogActor<LogStreamEntry>

    init {
        val model = ListTableModel(
            arrayOf(LogStreamDateColumn(), LogStreamMessageColumn()),
            mutableListOf<LogStreamEntry>(),
            // Don't sort in the model because the requests come sorted
            -1,
            SortOrder.UNSORTED
        )
        logsTable = TableView(model).apply {
            autoscrolls = true
            tableHeader.reorderingAllowed = false
            tableHeader.resizingAllowed = false
            autoResizeMode = JTable.AUTO_RESIZE_LAST_COLUMN
            setPaintBusy(true)
            emptyText.text = message("loading_resource.loading")
        }

        // TODO this also searches the date column which we don't want to do.
        // The converter for TableSpeedSearch takes a string which we can't do much with
        // unless we want to detect it's a timestamp but it might detect messages too
        TableSpeedSearch(logsTable)

        logStreamActor = when (type) {
            TableType.LIST -> LogStreamListActor(project, client, logsTable, logGroup, logStream)
            TableType.FILTER -> LogStreamFilterActor(project, client, logsTable, logGroup, logStream)
        }
        Disposer.register(this@LogStreamTable, logStreamActor)
        channel = logStreamActor.channel

        component = ScrollPaneFactory.createScrollPane(logsTable).also {
            it.topReached {
                if (logsTable.rowCount != 0) {
                    launch { logStreamActor.channel.send(LogActor.Message.LoadBackward) }
                }
            }
            it.bottomReached {
                if (logsTable.rowCount != 0) {
                    launch { logStreamActor.channel.send(LogActor.Message.LoadForward) }
                }
            }
        }

        addActionsToTable()
    }

    private fun addActionsToTable() {
        val actionGroup = DefaultActionGroup().apply {
            add(CopyFromTableAction(logsTable))
            add(Separator())
            add(ShowLogsAroundActionGroup(project, logGroup, logStream, logsTable))
        }
        PopupHandler.installPopupHandler(
            logsTable,
            actionGroup,
            ActionPlaces.EDITOR_POPUP,
            ActionManager.getInstance()
        )
    }

    override fun dispose() {}
}
