// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor

import com.intellij.icons.AllIcons
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.Constraints
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.SimpleToolWindowPanel
import com.intellij.openapi.util.Disposer
import com.intellij.ui.SearchTextField
import com.intellij.ui.components.breadcrumbs.Breadcrumbs
import kotlinx.coroutines.launch
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.coroutines.disposableCoroutineScope
import software.aws.toolkits.jetbrains.core.coroutines.getCoroutineUiContext
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.CloudWatchLogsActor
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.LogStreamEntry
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions.OpenCurrentInEditorAction
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions.TailLogsAction
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions.WrapLogsAction
import software.aws.toolkits.jetbrains.utils.ui.onEmpty
import software.aws.toolkits.jetbrains.utils.ui.onEnter
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CloudWatchResourceType
import software.aws.toolkits.telemetry.CloudwatchlogsTelemetry
import java.time.Duration
import javax.swing.JPanel

class CloudWatchLogStream(
    private val project: Project,
    private val logGroup: String,
    private val logStream: String,
    private val previousEvent: LogStreamEntry? = null,
    private val duration: Duration? = null,
    streamLogs: Boolean = false
) : Disposable {
    private val coroutineScope = disposableCoroutineScope(this)
    lateinit var content: JPanel
        private set
    private lateinit var breadcrumbHolder: JPanel
    private lateinit var locationInformation: Breadcrumbs
    private lateinit var tablePanel: SimpleToolWindowPanel
    private lateinit var searchField: SearchTextField

    private val edtContext = getCoroutineUiContext()

    private val client: CloudWatchLogsClient = project.awsClient()
    private val logStreamTable: LogStreamTable = LogStreamTable(project, client, logGroup, logStream, LogStreamTable.TableType.LIST).also {
        Disposer.register(this@CloudWatchLogStream, it)
    }
    private var searchStreamTable: LogStreamTable? = null
    private val tailLogsAction = TailLogsAction(project) { searchStreamTable?.channel ?: logStreamTable.channel }

    private fun createUIComponents() {
        tablePanel = SimpleToolWindowPanel(false, true)
        searchField = SearchTextField(false).also {
            it.textEditor.emptyText.text = message("cloudwatch.logs.filter_logs")
        }
    }

    init {
        tablePanel.setContent(logStreamTable.component)

        val locationCrumbs = LocationCrumbs(project, logGroup, logStream)
        locationInformation.crumbs = locationCrumbs.crumbs
        breadcrumbHolder.border = locationCrumbs.border

        addActionToolbar()
        addSearchListener()

        refreshTable()

        if (streamLogs) {
            tailLogsAction.setSelected(true)
        }
    }

    private fun addSearchListener() {
        // If the text field is emptied, like what the x button does, clear the table and dispose the old one if it exists
        // This leads to a weird UX where we search if enter is pressed but if the text in the box is deleted we clear the
        // search state.
        // TODO can we do better?
        searchField.onEmpty {
            val oldTable = searchStreamTable
            searchStreamTable = null
            coroutineScope.launch(edtContext) {
                tablePanel.setContent(logStreamTable.component)
                // Dispose the old one if it was not null
                oldTable?.let { launch { Disposer.dispose(it) } }
            }
        }
        // Add action listener on enter to search. This is needed so we don't make a super costly network call
        // for every letter that is typed in
        searchField.onEnter {
            val oldTable = searchStreamTable
            // If it is not empty do a search
            if (searchField.text.isNotEmpty()) {
                // This is thread safe because the actionPerformed is run on the UI thread
                CloudwatchlogsTelemetry.searchStream(project, true)
                val table = LogStreamTable(project, client, logGroup, logStream, LogStreamTable.TableType.FILTER)
                Disposer.register(this@CloudWatchLogStream, table)
                searchStreamTable = table
                coroutineScope.launch(edtContext) {
                    tablePanel.setContent(table.component)
                    oldTable?.let { launch { Disposer.dispose(it) } }
                }
                coroutineScope.launch {
                    table.channel.send(CloudWatchLogsActor.Message.LoadInitialFilter(searchField.text))
                }
            }
        }
    }

    private fun addActionToolbar() {
        val actionGroup = DefaultActionGroup()
        actionGroup.addAction(
            object : AnAction(message("general.refresh"), null, AllIcons.Actions.Refresh), DumbAware {
                override fun actionPerformed(e: AnActionEvent) {
                    refreshTable()
                    CloudwatchlogsTelemetry.refresh(project, CloudWatchResourceType.LogStream)
                }
            },
            Constraints.FIRST
        )
        actionGroup.add(
            OpenCurrentInEditorAction(project, logStream) {
                searchStreamTable?.logsTable?.listTableModel?.items ?: logStreamTable.logsTable.listTableModel.items
            }
        )
        actionGroup.add(tailLogsAction)
        actionGroup.add(WrapLogsAction(project) { searchStreamTable?.logsTable ?: logStreamTable.logsTable })
        val toolbar = ActionManager.getInstance().createActionToolbar("CloudWatchLogStream", actionGroup, false)
        toolbar.setTargetComponent(tablePanel.component)
        tablePanel.toolbar = toolbar.component
    }

    internal fun refreshTable() = coroutineScope.launch {
        if (searchField.text.isNotEmpty() && searchStreamTable != null) {
            searchStreamTable?.channel?.send(CloudWatchLogsActor.Message.LoadInitialFilter(searchField.text.trim()))
        } else if (previousEvent != null && duration != null) {
            logStreamTable.channel.send(CloudWatchLogsActor.Message.LoadInitialRange(previousEvent, duration))
        } else {
            logStreamTable.channel.send(CloudWatchLogsActor.Message.LoadInitial)
        }
    }

    override fun dispose() {}
}
