// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights

import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.SimpleToolWindowPanel
import com.intellij.openapi.util.Disposer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.InsightsQueryResultsActor
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CloudwatchinsightsTelemetry
import software.aws.toolkits.telemetry.InsightsDialogOpenSource
import javax.swing.JButton
import javax.swing.JLabel
import javax.swing.JPanel

class QueryResultList(
    private val project: Project,
    fields: List<String>,
    queryId: String,
    private val queryDetails: QueryDetails
) : CoroutineScope by ApplicationThreadPoolScope("CloudWatchLogsGroup"), Disposable {
    lateinit var resultsPanel: JPanel
    private lateinit var tablePanel: SimpleToolWindowPanel
    private lateinit var openQueryEditor: JButton
    private lateinit var resultsTitle: JLabel

    private val resultsTable: QueryResultsTable = QueryResultsTable(project, queryDetails.connectionSettings, fields, queryId)

    private fun createUIComponents() {
        tablePanel = SimpleToolWindowPanel(false, true)
    }

    init {
        openQueryEditor.text = message("cloudwatch.logs.open_query_editor")
        resultsTitle.text = message("cloudwatch.logs.query_result")
        Disposer.register(this, resultsTable)
        tablePanel.setContent(resultsTable.component)
        loadInitialResultsTable()
        openQueryEditor.addActionListener {
            QueryEditorDialog(project, queryDetails).show()
            CloudwatchinsightsTelemetry.openEditor(project, InsightsDialogOpenSource.ResultsWindow)
        }
    }

    private fun loadInitialResultsTable() {
        launch { resultsTable.channel.send(InsightsQueryResultsActor.Message.StartLoadingAll) }
    }

    override fun dispose() {
    }
}
