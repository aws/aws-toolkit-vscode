// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.editor

import com.intellij.icons.AllIcons
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.SimpleToolWindowPanel
import com.intellij.openapi.util.Disposer
import com.intellij.ui.SearchTextField
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.LogActor
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.getCoroutineUiContext
import software.aws.toolkits.jetbrains.utils.ui.onEmpty
import software.aws.toolkits.jetbrains.utils.ui.onEnter
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CloudwatchlogsTelemetry
import javax.swing.JPanel

class CloudWatchLogGroup(
    private val project: Project,
    private val logGroup: String
) : CoroutineScope by ApplicationThreadPoolScope("CloudWatchLogsGroup"), Disposable {
    lateinit var content: JPanel

    private val edtContext = getCoroutineUiContext(disposable = this)

    private lateinit var tablePanel: SimpleToolWindowPanel
    private lateinit var locationInformation: LocationBreadcrumbs
    private lateinit var searchField: SearchTextField
    private lateinit var breadcrumbHolder: JPanel

    val client: CloudWatchLogsClient = project.awsClient()
    private val groupTable: LogGroupTable = LogGroupTable(project, client, logGroup, LogGroupTable.TableType.LIST)
    private var searchGroupTable: LogGroupTable? = null

    private fun createUIComponents() {
        tablePanel = SimpleToolWindowPanel(false, true)
        searchField = SearchTextField(false).also {
            it.textEditor.emptyText.text = message("cloudwatch.logs.filter_loggroup")
        }
    }

    init {
        val locationCrumbs = LocationCrumbs(project, logGroup)
        locationInformation.crumbs = locationCrumbs.crumbs
        breadcrumbHolder.border = locationCrumbs.border
        locationInformation.installClickListener()

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
            launch(edtContext) {
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
                launch(edtContext) {
                    tablePanel.setContent(table.component)
                    oldTable?.let { launch { Disposer.dispose(it) } }
                }
                launch {
                    table.channel.send(LogActor.Message.LoadInitialFilter(searchField.text))
                }
            }
        }
    }

    private fun addToolbar() {
        val actionGroup = DefaultActionGroup()
        actionGroup.addAction(object : AnAction(message("general.refresh"), null, AllIcons.Actions.Refresh), DumbAware {
            override fun actionPerformed(e: AnActionEvent) {
                CloudwatchlogsTelemetry.refreshGroup(project)
                refreshTable()
            }
        })
        tablePanel.toolbar = ActionManager.getInstance().createActionToolbar("CloudWatchLogStream", actionGroup, false).component
    }

    private fun refreshTable() {
        launch { groupTable.channel.send(LogActor.Message.LoadInitial) }
    }

    override fun dispose() {}
}
