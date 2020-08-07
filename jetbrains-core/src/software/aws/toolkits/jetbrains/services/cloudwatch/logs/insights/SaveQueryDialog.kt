// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.ValidationInfo
import kotlinx.coroutines.CoroutineScope
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.amazon.awssdk.services.cloudwatchlogs.model.PutQueryDefinitionRequest
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.resources.message
import java.awt.event.ActionEvent
import javax.swing.Action
import javax.swing.JComponent
import kotlinx.coroutines.launch
import software.amazon.awssdk.services.cloudwatchlogs.model.DescribeQueryDefinitionsRequest
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.notifyInfo

class SaveQueryDialog(
    private val project: Project,
    private val query: String,
    private val logGroups: List<String>,
    private val client: CloudWatchLogsClient = project.awsClient()
) : DialogWrapper(project), CoroutineScope by ApplicationThreadPoolScope("SavingQuery") {

    val view = EnterQueryName(project)
    private val action: OkAction = object : OkAction() {
        init {
            putValue(Action.NAME, message("cloudwatch.logs.save_query"))
        }
        override fun doAction(e: ActionEvent?) {
            super.doAction(e)
            if (doValidateAll().isNotEmpty()) return
            saveQuery()

            close(OK_EXIT_CODE)
        }
    }
    init {
        super.init()
        title = message("cloudwatch.logs.save_query_dialog_name")
    }

    override fun createCenterPanel(): JComponent? = view.saveQueryPanel
    override fun doValidate(): ValidationInfo? = validateQueryName(view)
    override fun getOKAction(): Action = action

    fun checkQueryName(queryName: String): Boolean {
        val request = DescribeQueryDefinitionsRequest.builder().queryDefinitionNamePrefix(queryName).build()
        val response = client.describeQueryDefinitions(request)
        return response.queryDefinitions().isEmpty()
    }

    fun saveQuery() = launch {
        try {
            val queryName = view.queryName.text
            if (checkQueryName(queryName)) {
                val request = PutQueryDefinitionRequest.builder().logGroupNames(logGroups).name(queryName).queryString(query).build()
                val response = client.putQueryDefinition(request)
                notifyInfo(message("cloudwatch.logs.saved_query_status"), message("cloudwatch.logs.query_saved_successfully"), project)
            } else {
                notifyError(message("cloudwatch.logs.saved_query_status"), message("cloudwatch.logs.query_not_saved"))
            }
        } catch (e: Exception) {
            notifyError(message("cloudwatch.logs.saved_query_status"), e.toString())
        }
    }

    fun validateQueryName(view: EnterQueryName): ValidationInfo? {
        if (view.queryName.text.isEmpty()) {
            return ValidationInfo(message("cloudwatch.logs.query_name"), view.queryName)
        }
        return null
    }
}
