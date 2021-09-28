// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights

import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.ui.DoubleClickListener
import com.intellij.ui.ScrollPaneFactory
import com.intellij.ui.table.TableView
import com.intellij.util.ui.ListTableModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.coroutines.disposableCoroutineScope
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.CloudWatchLogWindow
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.InsightsQueryResultsActor
import software.aws.toolkits.resources.message
import java.awt.event.MouseEvent
import javax.swing.JComponent

class QueryResultsTable(
    private val project: Project,
    connectionSettings: ConnectionSettings,
    fields: List<String>,
    queryId: String
) : Disposable {
    private val coroutineScope = disposableCoroutineScope(this)
    private val client = let {
        val (credentials, region) = connectionSettings
        AwsClientManager.getInstance().getClient<CloudWatchLogsClient>(credentials, region)
    }
    private val insightsQueryActor: InsightsQueryResultsActor
    val component: JComponent
    val channel: Channel<InsightsQueryResultsActor.Message>
    val resultsTable: TableView<LogResult>

    init {
        val tableModel = ListTableModel<LogResult>(
            *fields.map {
                LogResultColumnInfo(it)
            }.toTypedArray()
        )

        resultsTable = TableView(tableModel).apply {
            setPaintBusy(true)
            autoscrolls = true
            emptyText.text = message("loading_resource.loading")
            tableHeader.reorderingAllowed = false
            tableHeader.resizingAllowed = true
        }

        installDetailedLogRecordOpenListener()
        insightsQueryActor = InsightsQueryResultsActor(project, client, resultsTable, queryId).also {
            Disposer.register(this, it)
        }
        channel = insightsQueryActor.channel
        component = ScrollPaneFactory.createScrollPane(resultsTable)
    }

    private fun installDetailedLogRecordOpenListener() {
        object : DoubleClickListener() {
            override fun onDoubleClick(e: MouseEvent): Boolean {
                // assume you can't double click multiple selection
                val identifier = resultsTable.selectedObject?.identifier() ?: return false
                coroutineScope.launch { CloudWatchLogWindow.getInstance(project).showDetailedEvent(client, identifier) }
                return true
            }
        }.installOn(resultsTable)
    }

    override fun dispose() {}
}
