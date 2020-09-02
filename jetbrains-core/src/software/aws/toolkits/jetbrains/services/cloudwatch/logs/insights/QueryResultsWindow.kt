// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights

import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.project.Project
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import software.aws.toolkits.jetbrains.core.toolwindow.ToolkitToolWindowManager
import software.aws.toolkits.jetbrains.core.toolwindow.ToolkitToolWindowType
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.getCoroutineUiContext
import software.aws.toolkits.resources.message

class QueryResultsWindow(private val project: Project) : CoroutineScope by ApplicationThreadPoolScope("openResultsWindow") {
    private val toolWindow = ToolkitToolWindowManager.getInstance(project, INSIGHTS_RESULTS_TOOL_WINDOW)
    private val edtContext = getCoroutineUiContext()
    fun showResults(queryId: String, fieldList: List<String>, selectedlogGroup: String) = launch {
        val existingWindow = toolWindow.find(queryId)
        if (existingWindow != null) {
            withContext(edtContext) {
                existingWindow.show()
            }
            return@launch
        }
        val queryResult = QueryResultList(project, fieldList, queryId, selectedlogGroup)
        withContext(edtContext) {
            toolWindow.addTab(queryId, queryResult.resultsPanel, activate = true, id = queryId, disposable = queryResult)
        }
    }

    companion object {
        internal val INSIGHTS_RESULTS_TOOL_WINDOW = ToolkitToolWindowType(
            "AWS.InsightsResultsTable",
            message("cloudwatch.logs.results_window_title")
        )
        fun getInstance(project: Project) = ServiceManager.getService(project, QueryResultsWindow::class.java)
    }
}
