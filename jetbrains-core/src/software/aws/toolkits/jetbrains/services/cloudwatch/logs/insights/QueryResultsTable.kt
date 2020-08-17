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
    private val project: Project,
    private val client: CloudWatchLogsClient,
    private val fieldList: List<String>,
    private val queryId: String
) : CoroutineScope by ApplicationThreadPoolScope("QueryResultsTable"), Disposable {
    val component: JComponent
    val channel: Channel<QueryActor.MessageLoadQueryResults>
    private val resultsTable: TableView<Map<String, String>>
    private val queryActor: QueryActor<Map<String, String>>

    init {
            val columnInfoList: ArrayList<ColumnInfoDetails> = arrayListOf()
            for (field in fieldList) {
                columnInfoList.add(ColumnInfoDetails(field))
            }
            val columnInfoArray = columnInfoList.toTypedArray()
            val tableModel = ListTableModel(
                columnInfoArray, listOf<Map<String, String>>()
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
