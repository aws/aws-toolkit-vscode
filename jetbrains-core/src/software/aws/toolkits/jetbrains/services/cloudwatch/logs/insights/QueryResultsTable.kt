// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights

import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project
import com.intellij.ui.ScrollPaneFactory
import com.intellij.ui.table.TableView
import com.intellij.util.ui.ListTableModel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.ui.bottomReached
import software.aws.toolkits.resources.message
import javax.swing.JComponent

class QueryResultsTable(
    project: Project,
    client: CloudWatchLogsClient,
    fieldList: List<String>,
    queryId: String
) : CoroutineScope by ApplicationThreadPoolScope("QueryResultsTable"), Disposable {
    val component: JComponent
    val channel: Channel<QueryActor.MessageLoadQueryResults>
    private val resultsTable: TableView<Map<String, String>>
    private val queryActor: QueryActor<Map<String, String>>

    init {
        val columnInfo = fieldList.map {
            ColumnInfoDetails(it)
        }.toTypedArray()

        val tableModel = ListTableModel(
            columnInfo,
            listOf<Map<String, String>>()
        )

        resultsTable = TableView(tableModel).apply {
            setPaintBusy(true)
            autoscrolls = true
            emptyText.text = message("loading_resource.loading")
            tableHeader.reorderingAllowed = false
            tableHeader.resizingAllowed = true
        }

        queryActor = QueryResultsActor(project, client, resultsTable, queryId)
        channel = queryActor.channel
        component = ScrollPaneFactory.createScrollPane(resultsTable).also {
            it.bottomReached {
                if (resultsTable.rowCount != 0) {
                    launch { queryActor.channel.send(QueryActor.MessageLoadQueryResults.LoadNextQueryBatch) }
                }
            }
        }
    }
    override fun dispose() {}
}
