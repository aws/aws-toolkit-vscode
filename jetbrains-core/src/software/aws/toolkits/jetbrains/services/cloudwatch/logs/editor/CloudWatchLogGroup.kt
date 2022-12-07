// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor

import com.intellij.icons.AllIcons
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.SimpleToolWindowPanel
import com.intellij.openapi.util.Disposer
import com.intellij.ui.SearchTextField
import kotlinx.coroutines.launch
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.coroutines.disposableCoroutineScope
import software.aws.toolkits.jetbrains.core.coroutines.getCoroutineUiContext
import software.aws.toolkits.jetbrains.core.credentials.AwsConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.ConnectionState
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.CloudWatchLogsActor
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights.QueryEditorDialog
import software.aws.toolkits.jetbrains.utils.ui.onEmpty
import software.aws.toolkits.jetbrains.utils.ui.onEnter
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CloudWatchResourceType
import software.aws.toolkits.telemetry.CloudwatchinsightsTelemetry
import software.aws.toolkits.telemetry.CloudwatchlogsTelemetry
import software.aws.toolkits.telemetry.InsightsDialogOpenSource
import javax.swing.JPanel

class CloudWatchLogGroup(
    private val project: Project,
    private val logGroup: String
) : Disposable {
    private val coroutineScope = disposableCoroutineScope(this)
    lateinit var content: JPanel
        private set

    private val edtContext = getCoroutineUiContext()

    private lateinit var tablePanel: SimpleToolWindowPanel
    private lateinit var locationInformation: LocationBreadcrumbs
    private lateinit var searchField: SearchTextField
    private lateinit var breadcrumbHolder: JPanel

    private val client: CloudWatchLogsClient
    private val connection: ConnectionSettings
    private val groupTable: LogGroupTable
    private var searchGroupTable: LogGroupTable? = null

    private fun createUIComponents() {
        tablePanel = SimpleToolWindowPanel(false, true)
        searchField = SearchTextField(false).also {
            it.textEditor.emptyText.text = message("cloudwatch.logs.filter_loggroup")
        }
    }

    init {

        connection = when (val state = AwsConnectionManager.getInstance(project).connectionState) {
            is ConnectionState.ValidConnection -> ConnectionSettings(state.credentials, state.region)
            else -> throw IllegalStateException(state.shortMessage)
        }
        client = AwsClientManager.getInstance().getClient(connection.credentials, connection.region)
        groupTable = LogGroupTable(project, client, logGroup, LogGroupTable.TableType.LIST)

        val locationCrumbs = LocationCrumbs(project, logGroup)
        locationInformation.crumbs = locationCrumbs.crumbs
        breadcrumbHolder.border = locationCrumbs.border

        Disposer.register(this, groupTable)
        tablePanel.setContent(groupTable.component)
        addToolbar()
        addSearch()

        refreshTable()
    }

    private fun addSearch() {
        searchField.onEmpty {
            val oldTable = searchGroupTable
            searchGroupTable = null
            coroutineScope.launch(edtContext) {
                tablePanel.setContent(groupTable.component)
                // Dispose the old one if it was not null
                oldTable?.let { launch { Disposer.dispose(it) } }
            }
        }
        searchField.onEnter {
            val oldTable = searchGroupTable
            // If it is not empty do a search
            if (searchField.text.isNotEmpty()) {
                // This is thread safe because the actionPerformed is run on the UI thread
                CloudwatchlogsTelemetry.searchGroup(project, true)
                val table = LogGroupTable(project, client, logGroup, LogGroupTable.TableType.FILTER)
                Disposer.register(this@CloudWatchLogGroup, table)
                searchGroupTable = table
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

    private fun addToolbar() {
        val actionGroup = DefaultActionGroup()
        actionGroup.addAction(
            object : DumbAwareAction(message("general.refresh"), null, AllIcons.Actions.Refresh) {
                override fun actionPerformed(e: AnActionEvent) {
                    CloudwatchlogsTelemetry.refresh(project, CloudWatchResourceType.LogGroup)
                    refreshTable()
                }
            }
        )
        actionGroup.addAction(
            object : DumbAwareAction(message("cloudwatch.logs.query"), null, AllIcons.Actions.Find) {
                override fun actionPerformed(e: AnActionEvent) {
                    QueryEditorDialog(project, connection, logGroup).show()
                    CloudwatchinsightsTelemetry.openEditor(project, InsightsDialogOpenSource.LogGroup)
                }
            }
        )
        val toolbar = ActionManager.getInstance().createActionToolbar("CloudWatchLogStream", actionGroup, false)
        toolbar.setTargetComponent(tablePanel.component)
        tablePanel.toolbar = toolbar.component
    }

    internal fun refreshTable() {
        coroutineScope.launch { groupTable.channel.send(CloudWatchLogsActor.Message.LoadInitial) }
    }

    override fun dispose() {}
}
