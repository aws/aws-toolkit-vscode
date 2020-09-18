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
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.credentials.ConnectionSettings
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.ui.bottomReached
import software.aws.toolkits.resources.message
import java.awt.event.MouseEvent
import javax.swing.JComponent

class QueryResultsTable(
    private val project: Project,
    connectionSettings: ConnectionSettings,
    fields: List<String>,
    queryId: String
) : CoroutineScope by ApplicationThreadPoolScope("QueryResultsTable"), Disposable {
    val component: JComponent
    val channel: Channel<QueryActor.MessageLoadQueryResults>
    val resultsTable: TableView<LogResult>
    private val client = project.awsClient<CloudWatchLogsClient>(connectionSettings)
    private val queryActor: QueryActor<LogResult>

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
        queryActor = QueryResultsActor(project, client, resultsTable, queryId)
        Disposer.register(this, queryActor)
        channel = queryActor.channel
        component = ScrollPaneFactory.createScrollPane(resultsTable).also {
            it.bottomReached {
                if (resultsTable.rowCount != 0) {
                    launch { queryActor.channel.send(QueryActor.MessageLoadQueryResults.LoadNextQueryBatch) }
                }
            }
        }
    }

    private fun installDetailedLogRecordOpenListener() {
        object : DoubleClickListener() {
            override fun onDoubleClick(e: MouseEvent): Boolean {
                // assume you can't double click multiple selection
                val identifier = resultsTable.selectedObject?.identifier() ?: return false
                launch { QueryResultsWindow.getInstance(project).showDetailedEvent(client, identifier) }

                return true
            }
        }.installOn(resultsTable)
    }

    override fun dispose() {}
}
