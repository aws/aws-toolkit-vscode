// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor

import com.intellij.icons.AllIcons
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionPlaces
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.SimpleToolWindowPanel
import com.intellij.ui.DoubleClickListener
import com.intellij.ui.PopupHandler
import com.intellij.ui.ScrollPaneFactory
import com.intellij.ui.TableSpeedSearch
import com.intellij.ui.components.breadcrumbs.Breadcrumbs
import com.intellij.ui.table.JBTable
import com.intellij.ui.table.TableView
import com.intellij.util.ui.ListTableModel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.amazon.awssdk.services.cloudwatchlogs.model.DescribeLogStreamsRequest
import software.amazon.awssdk.services.cloudwatchlogs.model.LogStream
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.CloudWatchLogWindow
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions.ExportActionGroup
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.getCoroutineUiContext
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CloudwatchlogsTelemetry
import java.awt.event.MouseEvent
import javax.swing.JPanel

class CloudWatchLogGroup(
    private val project: Project,
    private val logGroup: String
) : CoroutineScope by ApplicationThreadPoolScope("CloudWatchLogsGroup"), Disposable {
    lateinit var content: JPanel

    private lateinit var tablePanel: SimpleToolWindowPanel
    private lateinit var groupTable: JBTable
    private lateinit var tableModel: ListTableModel<LogStream>
    private lateinit var locationInformation: Breadcrumbs

    private val client: CloudWatchLogsClient = project.awsClient()

    private val edtContext = getCoroutineUiContext(disposable = this)

    private fun createUIComponents() {
        tableModel = ListTableModel(
            arrayOf(LogStreamsStreamColumn(), LogStreamsDateColumn()),
            mutableListOf<LogStream>()
        )
        groupTable = TableView(tableModel).apply {
            setPaintBusy(true)
            autoscrolls = true
            emptyText.text = message("loading_resource.loading")
            tableHeader.reorderingAllowed = false
        }
        groupTable.rowSorter = LogGroupTableSorter(tableModel)
        TableSpeedSearch(groupTable)

        addTableMouseListener(groupTable)
        val scroll = ScrollPaneFactory.createScrollPane(groupTable)
        tablePanel = SimpleToolWindowPanel(false, true)
        tablePanel.setContent(scroll)
    }

    init {
        val locationCrumbs = LocationCrumbs(project, logGroup)
        locationInformation.crumbs = locationCrumbs.crumbs
        locationInformation.border = locationCrumbs.border
        locationInformation.installDoubleClickListener()

        addActions()
        addToolbar()

        launch { refreshLogStreams() }
    }

    private fun addTableMouseListener(table: JBTable) {
        object : DoubleClickListener() {
            override fun onDoubleClick(e: MouseEvent?): Boolean {
                e ?: return false
                val row = table.selectedRow.takeIf { it >= 0 } ?: return false
                val logStream = table.getValueAt(row, 0) as? String ?: return false
                val window = CloudWatchLogWindow.getInstance(project)
                window.showLogStream(logGroup, logStream)
                return true
            }
        }.installOn(table)
    }

    private suspend fun refreshLogStreams() {
        withContext(edtContext) {
            groupTable.setPaintBusy(true)
        }
        populateModel()
        withContext(edtContext) {
            groupTable.emptyText.text = message("cloudwatch.logs.no_log_groups")
            groupTable.setPaintBusy(false)
        }
    }

    private fun addActions() {
        val actionGroup = DefaultActionGroup()
        actionGroup.add(ExportActionGroup(project, client, logGroup) {
            val row = groupTable.selectedRow.takeIf { it >= 0 } ?: return@ExportActionGroup null
            groupTable.getValueAt(row, 0) as? String
        })
        PopupHandler.installPopupHandler(
            groupTable,
            actionGroup,
            ActionPlaces.EDITOR_POPUP,
            ActionManager.getInstance()
        )
    }

    private fun addToolbar() {
        val actionGroup = DefaultActionGroup()
        actionGroup.addAction(object : AnAction(message("explorer.refresh.title"), null, AllIcons.Actions.Refresh), DumbAware {
            override fun actionPerformed(e: AnActionEvent) {
                CloudwatchlogsTelemetry.refreshGroup(project)
                launch { refreshLogStreams() }
            }
        })
        tablePanel.toolbar = ActionManager.getInstance().createActionToolbar("CloudWatchLogStream", actionGroup, false).component
    }

    private suspend fun populateModel() = try {
        val streams = client.describeLogStreamsPaginator(DescribeLogStreamsRequest.builder().logGroupName(logGroup).build())
        streams.filterNotNull().firstOrNull()?.logStreams()?.let {
            withContext(edtContext) {
                tableModel.items = it
                groupTable.invalidate()
            }
        }
    } catch (e: Exception) {
        val errorMessage = message("cloudwatch.logs.failed_to_load_streams", logGroup)
        LOG.error(e) { errorMessage }
        notifyError(title = errorMessage, project = project)
    }

    override fun dispose() {}

    companion object {
        private val LOG = getLogger<CloudWatchLogGroup>()
    }
}
