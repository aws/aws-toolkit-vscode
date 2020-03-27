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
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.LogStreamActor
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions.OpenCurrentInEditorAction
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions.TailLogsAction
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.actions.WrapLogsAction
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.getCoroutineUiContext
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CloudwatchlogsTelemetry
import java.awt.event.ActionEvent
import java.awt.event.ActionListener
import java.time.Duration
import javax.swing.JPanel

class CloudWatchLogStream(
    private val project: Project,
    private val logGroup: String,
    private val logStream: String,
    private val startTime: Long? = null,
    private val duration: Duration? = null
) : CoroutineScope by ApplicationThreadPoolScope("CloudWatchLogStream"), Disposable {
    lateinit var content: JPanel
    private lateinit var breadcrumbHolder: JPanel
    private lateinit var locationInformation: Breadcrumbs
    private lateinit var tablePanel: SimpleToolWindowPanel
    private lateinit var searchField: SearchTextField

    private val edtContext = getCoroutineUiContext(disposable = this)

    private val client: CloudWatchLogsClient = project.awsClient()
    private val logStreamTable: LogStreamTable = LogStreamTable(project, client, logGroup, logStream, LogStreamTable.TableType.LIST)
    private var searchStreamTable: LogStreamTable? = null

    private fun createUIComponents() {
        tablePanel = SimpleToolWindowPanel(false, true)
        searchField = SearchTextField(false)
    }

    init {
        tablePanel.setContent(logStreamTable.component)

        val locationCrumbs = LocationCrumbs(project, logGroup, logStream)
        locationInformation.crumbs = locationCrumbs.crumbs
        breadcrumbHolder.border = locationCrumbs.border
        locationInformation.installClickListener()

        Disposer.register(this, logStreamTable)
        searchField.textEditor.emptyText.text = message("cloudwatch.logs.filter_logs")

        addActionToolbar()
        addSearchListener()

        refreshTable()
    }

    private fun addSearchListener() {
        searchField.textEditor.addActionListener(object : ActionListener {
            private var lastText = ""
            override fun actionPerformed(e: ActionEvent?) {
                val searchFieldText = searchField.text.trim()
                if (searchFieldText == lastText) {
                    return
                }
                lastText = searchFieldText
                val oldTable = searchStreamTable
                // If it is empty, replace the table with the original table
                if (searchFieldText.isEmpty()) {
                    searchStreamTable = null
                    launch(edtContext) {
                        tablePanel.setContent(logStreamTable.component)
                        // Dispose the old one if it was not null
                        oldTable?.let { launch { Disposer.dispose(it) } }
                    }
                } else {
                    // This is thread safe because the actionPerformed is run on the UI thread
                    CloudwatchlogsTelemetry.searchStream(project, true)
                    val table = LogStreamTable(project, client, logGroup, logStream, LogStreamTable.TableType.FILTER)
                    Disposer.register(this@CloudWatchLogStream, table)
                    searchStreamTable = table
                    launch(edtContext) {
                        tablePanel.setContent(table.component)
                        oldTable?.let { launch { Disposer.dispose(it) } }
                    }
                    launch {
                        table.channel.send(LogStreamActor.Message.LOAD_INITIAL_FILTER(searchFieldText))
                    }
                }
            }
        })
    }

    private fun addActionToolbar() {
        val actionGroup = DefaultActionGroup()
        actionGroup.addAction(object : AnAction(message("explorer.refresh.title"), null, AllIcons.Actions.Refresh), DumbAware {
            override fun actionPerformed(e: AnActionEvent) {
                launch { refreshTable() }
            }
        }, Constraints.FIRST)
        actionGroup.add(OpenCurrentInEditorAction(project, logStream) {
            searchStreamTable?.logsTable?.listTableModel?.items ?: logStreamTable.logsTable.listTableModel.items
        })
        actionGroup.add(TailLogsAction(project) { searchStreamTable?.channel ?: logStreamTable.channel })
        actionGroup.add(WrapLogsAction(project) { searchStreamTable?.logsTable ?: logStreamTable.logsTable })
        val toolbar = ActionManager.getInstance().createActionToolbar("CloudWatchLogStream", actionGroup, false)
        tablePanel.toolbar = toolbar.component
    }

    private fun refreshTable() = launch {
        CloudwatchlogsTelemetry.refreshStream(project)
        if (searchField.text.isNotEmpty() && searchStreamTable != null) {
            searchStreamTable?.channel?.send(LogStreamActor.Message.LOAD_INITIAL_FILTER(searchField.text.trim()))
        } else if (startTime != null && duration != null) {
            logStreamTable.channel.send(LogStreamActor.Message.LOAD_INITIAL_RANGE(startTime, duration))
        } else {
            logStreamTable.channel.send(LogStreamActor.Message.LOAD_INITIAL())
        }
    }

    override fun dispose() {}
}
