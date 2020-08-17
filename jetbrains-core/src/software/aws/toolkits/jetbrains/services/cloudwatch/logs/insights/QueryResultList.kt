// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights

import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.SimpleToolWindowPanel
import com.intellij.openapi.util.Disposer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.resources.message
import javax.swing.JButton
import javax.swing.JLabel
import javax.swing.JPanel

class QueryResultList(
    private val project: Project,
    private val fieldList: List<String>,
    private val queryId: String,
    private val selectedLogGroup: String
) : CoroutineScope by ApplicationThreadPoolScope("CloudWatchLogsGroup"), Disposable {
    lateinit var resultsPanel: JPanel
    private lateinit var tablePanel: SimpleToolWindowPanel
    private lateinit var openQueryEditor: JButton
    private lateinit var resultsTitle: JLabel
    val client: CloudWatchLogsClient = project.awsClient()
    private val resultsTable: QueryResultsTable = QueryResultsTable(project, client, fieldList, queryId)
    private fun createUIComponents() {
        // TODO: place custom component creation code here
        tablePanel = SimpleToolWindowPanel(false, true)
    }
    init {
        openQueryEditor.text = message("cloudwatch.logs.query")
        resultsTitle.text = message("cloudwatch.logs.query_result")
        Disposer.register(this, resultsTable)
        tablePanel.setContent(resultsTable.component)
        loadInitialResultsTable()
        openQueryEditor.addActionListener {
            QueryEditorDialog(project, selectedLogGroup, initialParametersDisplayed = false).show()
        }
    }
    private fun loadInitialResultsTable() {
        launch { resultsTable.channel.send(QueryActor.MessageLoadQueryResults.LoadInitialQueryResults) }
    }
    override fun dispose() {
    }
}
