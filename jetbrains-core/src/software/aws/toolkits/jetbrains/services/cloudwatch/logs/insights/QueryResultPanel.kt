// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights

import com.intellij.icons.AllIcons
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.SimpleToolWindowPanel
import com.intellij.openapi.util.Disposer
import kotlinx.coroutines.launch
import software.aws.toolkits.jetbrains.core.coroutines.disposableCoroutineScope
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.InsightsQueryResultsActor
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CloudwatchinsightsTelemetry
import software.aws.toolkits.telemetry.InsightsDialogOpenSource

class QueryResultPanel(
    private val project: Project,
    fields: List<String>,
    queryId: String,
    private val queryDetails: QueryDetails
) : SimpleToolWindowPanel(false, true), Disposable {
    private val coroutineScope = disposableCoroutineScope(this)
    init {
        val resultsTable = QueryResultsTable(project, queryDetails.connectionSettings, fields, queryId)
        Disposer.register(this, resultsTable)
        setContent(resultsTable.component)
        toolbar = ActionManager.getInstance().createActionToolbar(
            ID,
            DefaultActionGroup(
                object : AnAction(message("cloudwatch.logs.open_query_editor"), null, AllIcons.Actions.EditSource) {
                    override fun actionPerformed(e: AnActionEvent) {
                        QueryEditorDialog(project, queryDetails).show()
                        CloudwatchinsightsTelemetry.openEditor(project, InsightsDialogOpenSource.ResultsWindow)
                    }
                }
            ),
            false
        ).component
        coroutineScope.launch { resultsTable.channel.send(InsightsQueryResultsActor.Message.StartLoadingAll) }
    }

    override fun dispose() {
    }

    private companion object {
        const val ID = "QueryResultPanel"
    }
}
