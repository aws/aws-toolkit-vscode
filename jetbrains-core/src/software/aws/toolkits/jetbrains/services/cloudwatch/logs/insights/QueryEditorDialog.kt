// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.ValidationInfo
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.amazon.awssdk.services.cloudwatchlogs.model.StartQueryRequest
import software.aws.toolkits.jetbrains.core.awsClient
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import java.awt.event.ActionEvent
import java.time.temporal.ChronoUnit
import javax.swing.Action
import javax.swing.JComponent

class QueryEditorDialog(
    private val project: Project,
    queryDetails: QueryDetails,
    private val client: CloudWatchLogsClient = project.awsClient()
) : DialogWrapper(project), CoroutineScope by ApplicationThreadPoolScope("QueryEditorDialog") {
    constructor(project: Project, logGroupName: String, client: CloudWatchLogsClient = project.awsClient()) :
        this(project, defaultQuery(logGroupName), client)

    private val view = QueryEditor(project, queryDetails.logGroups)
    private val action: OkAction = QueryLogGroupOkAction()

    init {
        super.init()

        title = message("cloudwatch.logs.query_editor_title")
        setView(queryDetails)
    }

    override fun createCenterPanel(): JComponent? = view.queryEditorBasePanel

    override fun doValidate(): ValidationInfo? = validateEditorEntries(view)

    override fun getOKAction(): Action = action

    override fun doOKAction() {
        // Do nothing, close logic is handled separately
    }

    private fun setView(queryDetails: QueryDetails) {
        // TODO: handle multiple groups
        view.logGroupLabel.text = "Log Group : ${queryDetails.logGroups.first()}"

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

    private fun getQueryDetails(): QueryDetails {
        val timeRange = if (view.absoluteTimeRadioButton.isSelected) {
            TimeRange.AbsoluteRange(
                startDate = view.startDate.date,
                endDate = view.endDate.date
            )
        } else {
            TimeRange.RelativeRange(
                relativeTimeAmount = view.relativeTimeNumber.text.toLong(),
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
            logGroups = view.logGroupNames.toMutableList(),
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
        return null
    }

    fun startQueryAsync(queryDetails: QueryDetails) = async {
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
        private fun defaultQuery(logGroupName: String) = QueryDetails(
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
