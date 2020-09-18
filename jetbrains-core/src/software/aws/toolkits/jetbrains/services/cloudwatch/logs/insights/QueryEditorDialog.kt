// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights

import com.intellij.openapi.application.ModalityState
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.ValidationInfo
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.async
import kotlinx.coroutines.future.await
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.amazon.awssdk.services.cloudwatchlogs.model.StartQueryRequest
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.core.credentials.ConnectionSettings
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.resources.CloudWatchResources
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.getCoroutineUiContext
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import java.awt.event.ActionEvent
import java.time.temporal.ChronoUnit
import javax.swing.Action
import javax.swing.JComponent

class QueryEditorDialog(
    private val project: Project,
    private val initialQueryDetails: QueryDetails
) : DialogWrapper(project), CoroutineScope by ApplicationThreadPoolScope("QueryEditorDialog") {
    constructor(project: Project, connectionSettings: ConnectionSettings, logGroupName: String) :
        this(project, defaultQuery(connectionSettings, logGroupName))

    private val view = QueryEditor(project, initialQueryDetails)
    private val action: OkAction = QueryLogGroupOkAction()

    init {
        super.init()

        title = message("cloudwatch.logs.query_editor_title")
        launch {
            setView(initialQueryDetails)
        }
    }

    override fun createCenterPanel(): JComponent? = view.queryEditorBasePanel

    override fun doValidate(): ValidationInfo? = validateEditorEntries(view)

    override fun getOKAction(): Action = action

    override fun doOKAction() {
        // Do nothing, close logic is handled separately
    }

    suspend fun setView(queryDetails: QueryDetails) {
        when (val timeRange = queryDetails.timeRange) {
            is TimeRange.AbsoluteRange -> {
                view.setAbsolute()
                view.startDate.date = timeRange.startDate
                view.endDate.date = timeRange.endDate
            }

            is TimeRange.RelativeRange -> {
                view.setRelative()
                view.relativeTimeNumber.text = timeRange.relativeTimeAmount.toString()
                view.relativeTimeUnit.selectedItem = timeRange.relativeTimeUnit
            }
        }

        when (val query = queryDetails.query) {
            is QueryString.SearchTermQueryString -> {
                view.setSearchTerm()
                view.querySearchTerm.text = query.searchTerm
            }

            is QueryString.InsightsQueryString -> {
                view.setQueryLanguage()
                view.queryBox.text = query.query
            }
        }

        val availableLogGroups = AwsResourceCache.getInstance(project).getResource(
            CloudWatchResources.LIST_LOG_GROUPS,
            region = initialQueryDetails.connectionSettings.region,
            credentialProvider = initialQueryDetails.connectionSettings.credentials
        ).await().map { it.logGroupName() }
        withContext(getCoroutineUiContext(ModalityState.stateForComponent(view.logGroupTable))) {
            view.logGroupTable.populateLogGroups(initialQueryDetails.logGroups.toSet(), availableLogGroups)
        }
    }

    private fun beginQuerying() {
        if (!okAction.isEnabled) {
            return
        }

        close(OK_EXIT_CODE)
        val queryDetails = getQueryDetails()
        val fieldList = getFields(queryDetails.getQueryString())
        launch {
            val queryId = startQueryAsync(queryDetails).await()
            QueryResultsWindow.getInstance(project).showResults(queryDetails, queryId, fieldList)
        }
    }

    fun getQueryDetails(): QueryDetails {
        val timeRange = if (view.absoluteTimeRadioButton.isSelected) {
            TimeRange.AbsoluteRange(
                startDate = view.startDate.date,
                endDate = view.endDate.date
            )
        } else {
            TimeRange.RelativeRange(
                relativeTimeAmount = view.getRelativeTimeAmount(),
                relativeTimeUnit = view.getSelectedTimeUnit()
            )
        }

        val query = if (view.queryLogGroupsRadioButton.isSelected) {
            QueryString.SearchTermQueryString(
                searchTerm = view.querySearchTerm.text
            )
        } else {
            QueryString.InsightsQueryString(
                query = view.queryBox.text
            )
        }

        return QueryDetails(
            connectionSettings = initialQueryDetails.connectionSettings,
            logGroups = view.logGroupTable.getSelectedLogGroups(),
            timeRange = timeRange,
            query = query
        )
    }

    private inner class QueryLogGroupOkAction : OkAction() {
        init {
            putValue(Action.NAME, message("cloudwatch.logs.query.form.ok_Button"))
        }

        override fun doAction(e: ActionEvent?) {
            super.doAction(e)
            if (doValidateAll().isNotEmpty()) return
            beginQuerying()
        }
    }

    fun validateEditorEntries(view: QueryEditor): ValidationInfo? {
        if (!view.absoluteTimeRadioButton.isSelected && !view.relativeTimeRadioButton.isSelected) {
            return ValidationInfo(message("cloudwatch.logs.validation.timerange"), view.absoluteTimeRadioButton)
        }
        if (view.relativeTimeRadioButton.isSelected && view.relativeTimeNumber.text.isEmpty()) {
            return ValidationInfo(message("cloudwatch.logs.no_relative_time_number"), view.relativeTimeNumber)
        }
        if (view.absoluteTimeRadioButton.isSelected && view.startDate.date > view.endDate.date) {
            return ValidationInfo(message("cloudwatch.logs.compare.start.end.date"), view.startDate)
        }
        if (view.queryLogGroupsRadioButton.isSelected && view.queryBox.text.isEmpty()) {
            return ValidationInfo(message("cloudwatch.logs.no_query_entered"), view.queryBox)
        }
        if (view.searchTerm.isSelected && view.querySearchTerm.text.isEmpty()) {
            return ValidationInfo(message("cloudwatch.logs.no_term_entered"), view.querySearchTerm)
        }
        if (view.logGroupTable.getSelectedLogGroups().isEmpty()) {
            return ValidationInfo(message("cloudwatch.logs.no_log_group"), view.logGroupTable)
        }
        return null
    }

    fun startQueryAsync(queryDetails: QueryDetails) = async {
        val client = project.awsClient<CloudWatchLogsClient>(queryDetails.connectionSettings)
        val timeRange = queryDetails.getQueryRange()
        val queryString = queryDetails.getQueryString()
        try {
            val request = StartQueryRequest.builder()
                .logGroupNames(queryDetails.logGroups)
                .startTime(timeRange.start.epochSecond)
                .endTime(timeRange.end.epochSecond)
                .queryString(queryString)
                .build()
            val response = client.startQuery(request)

            return@async response.queryId()
        } catch (e: Exception) {
            notifyError(message("cloudwatch.logs.query_result_completion_status"), e.toString())
            throw e
        }
    }

    companion object {
        private fun defaultQuery(connectionSettings: ConnectionSettings, logGroupName: String) = QueryDetails(
            connectionSettings,
            mutableListOf(logGroupName),
            TimeRange.RelativeRange(10, ChronoUnit.MINUTES),
            QueryString.InsightsQueryString(DEFAULT_INSIGHTS_QUERY_STRING)
        )

        fun getFields(query: String): List<String> {
            val fieldsIdentifier = "fields"
            val fieldList = mutableListOf<List<String>>()
            query.replace("\\|", "")
            val queries = query.split("|")
            for (item in queries) {
                val splitQuery = item.trim()
                if (splitQuery.startsWith(fieldsIdentifier, ignoreCase = false)) {
                    val fields = splitQuery.substringAfter(fieldsIdentifier)
                    fieldList.add(fields.split(",").map { it.trim() })
                }
            }
            if (fieldList.isEmpty()) {
                return listOf("@message", "@timestamp")
            }
            return fieldList.flatten()
        }
    }
}
