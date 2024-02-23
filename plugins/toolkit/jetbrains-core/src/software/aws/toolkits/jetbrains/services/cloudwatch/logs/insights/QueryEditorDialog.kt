// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.ValidationInfo
import kotlinx.coroutines.async
import kotlinx.coroutines.future.await
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.core.coroutines.getCoroutineUiContext
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.CloudWatchLogWindow
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.resources.CloudWatchResources
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.CloudwatchinsightsTelemetry
import software.aws.toolkits.telemetry.InsightsQueryStringType
import software.aws.toolkits.telemetry.InsightsQueryTimeType
import software.aws.toolkits.telemetry.Result
import java.awt.event.ActionEvent
import java.time.temporal.ChronoUnit
import javax.swing.Action
import javax.swing.JComponent

class QueryEditorDialog internal constructor(
    // TODO: Exposed for testing only, should be refactored to be private
    private val project: Project,
    private val initialQueryDetails: QueryDetails
) : DialogWrapper(project) {
    private val coroutineScope = projectCoroutineScope(project)
    constructor(project: Project, connectionSettings: ConnectionSettings, logGroupName: String) :
        this(project, defaultQuery(connectionSettings, logGroupName))

    private val view = QueryEditor(project, initialQueryDetails)
    private val action: OkAction = QueryLogGroupOkAction()

    init {
        super.init()

        title = message("cloudwatch.logs.query_editor_title")
        coroutineScope.launch {
            setView(initialQueryDetails)
        }
    }

    override fun createCenterPanel(): JComponent? = view.queryEditorBasePanel

    override fun doValidate(): ValidationInfo? = validateEditorEntries(view)

    override fun getOKAction(): Action = action

    override fun doOKAction() {
        // Do nothing, close logic is handled separately
    }

    // TODO: Exposed for testing only, should be refactored to be private
    internal suspend fun setView(queryDetails: QueryDetails) {
        when (val timeRange = queryDetails.timeRange) {
            is TimeRange.AbsoluteRange -> {
                view.setAbsolute()
                view.startDate.date = timeRange.startDate
                view.endDate.date = timeRange.endDate
            }

            is TimeRange.RelativeRange -> {
                view.setRelative()
                view.relativeTimeNumber.text = timeRange.relativeTimeAmount.toString()
                view.setSelectedTimeUnit(timeRange.relativeTimeUnit)
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

        val availableLogGroups = AwsResourceCache.getInstance().getResource(
            CloudWatchResources.LIST_LOG_GROUPS,
            region = initialQueryDetails.connectionSettings.region,
            credentialProvider = initialQueryDetails.connectionSettings.credentials
        ).await().map { it.logGroupName() }
        withContext(getCoroutineUiContext()) {
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
        coroutineScope.launch {
            val queryId = startQueryAsync(queryDetails).await()
            CloudWatchLogWindow.getInstance(project).showQueryResults(queryDetails, queryId, fieldList)
        }
    }

    // TODO: Exposed for testing only, should be refactored to be private
    internal fun getQueryDetails(): QueryDetails {
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

        val query = if (view.searchTerm.isSelected) {
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

    // TODO: Exposed for testing only, should be refactored to be private
    internal fun validateEditorEntries(view: QueryEditor): ValidationInfo? {
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

    // TODO: Exposed for testing only, should be refactored to be private
    internal fun startQueryAsync(queryDetails: QueryDetails) = coroutineScope.async {
        val (credentials, region) = queryDetails.connectionSettings
        val client = AwsClientManager.getInstance().getClient<CloudWatchLogsClient>(credentials, region)
        val timeRange = queryDetails.getQueryRange()
        val queryString = queryDetails.getQueryString()
        var result = Result.Succeeded
        try {
            val response = client.startQuery {
                it.logGroupNames(queryDetails.logGroups)
                it.startTime(timeRange.start.epochSecond)
                it.endTime(timeRange.end.epochSecond)
                it.queryString(queryString)
                // 1k is default
                it.limit(1000)
            }

            return@async response.queryId()
        } catch (e: Exception) {
            notifyError(message("cloudwatch.logs.query_result_completion_status"), e.toString())
            result = Result.Failed
            throw e
        } finally {
            val timeType = when (queryDetails.timeRange) {
                is TimeRange.AbsoluteRange -> InsightsQueryTimeType.Absolute
                is TimeRange.RelativeRange -> InsightsQueryTimeType.Relative
            }
            val searchStringType = when (queryDetails.query) {
                is QueryString.InsightsQueryString -> InsightsQueryStringType.Insights
                is QueryString.SearchTermQueryString -> InsightsQueryStringType.SearchTerm
            }
            CloudwatchinsightsTelemetry.executeQuery(project, result, timeType, searchStringType)
        }
    }

    companion object {
        private fun defaultQuery(connection: ConnectionSettings, logGroupName: String) = QueryDetails(
            connection,
            mutableListOf(logGroupName),
            TimeRange.RelativeRange(10, ChronoUnit.MINUTES),
            QueryString.InsightsQueryString(DEFAULT_INSIGHTS_QUERY_STRING)
        )

        // TODO: Exposed for testing only, should be refactored to be private
        internal fun getFields(query: String): List<String> {
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
                return listOf("@timestamp", "@message")
            }
            return fieldList.flatten()
        }
    }
}
