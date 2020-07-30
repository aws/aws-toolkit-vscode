// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.ValidationInfo
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.aws.toolkits.jetbrains.core.awsClient
import java.awt.event.ActionEvent
import javax.swing.Action
import javax.swing.JComponent
import software.aws.toolkits.resources.message
import java.time.temporal.ChronoUnit
import java.util.Calendar
import java.util.Date

val relativeTimeUnit = mapOf(
    message("cloudwatch.logs.time_minutes") to ChronoUnit.MINUTES,
    message("cloudwatch.logs.time_hours") to ChronoUnit.HOURS,
    message("cloudwatch.logs.time_days") to ChronoUnit.DAYS,
    message("cloudwatch.logs.time_weeks") to ChronoUnit.WEEKS)

class QueryEditorDialog(
    private val project: Project,
    private val lGroupName: String,
    private val client: CloudWatchLogsClient
) : DialogWrapper(project) {
    constructor(project: Project, logGroupName: String) :
        this(project = project, lGroupName = logGroupName, client = project.awsClient())

    private val view = QueryEditor(project)
    private val queryingLogGroupApiCall = QueryingLogGroups(project)
    private val action: OkAction = QueryLogGroupOkAction()
    private val logGroupNames = listOf(lGroupName)

    init {
        super.init()
        title = message("cloudwatch.logs.query_editor_title")
        view.absoluteTimeRadioButton.addActionListener {
            view.startDate.isEnabled = true
            view.endDate.isEnabled = true
            view.relativeTimeNumber.isEnabled = false
            view.relativeTimeUnit.setEnabled(false)
        }
        view.relativeTimeRadioButton.addActionListener {
            view.startDate.isEnabled = false
            view.endDate.isEnabled = false
            view.relativeTimeNumber.isEnabled = true
            view.relativeTimeUnit.setEnabled(true)
        }
        view.queryLogGroupsRadioButton.addActionListener {
            view.queryBox.isEnabled = true
            view.querySearchTerm.isEnabled = false
        }
        view.searchTerm.addActionListener {
            view.queryBox.isEnabled = false
            view.querySearchTerm.isEnabled = true
        }
    }
    override fun createCenterPanel(): JComponent? = view.queryEditorBasePanel
    override fun doValidate(): ValidationInfo? = validateEditorEntries(view)
    override fun getOKAction(): Action = action
    override fun doCancelAction() {
        super.doCancelAction()
    }

    override fun doOKAction() {
        // Do nothing, close logic is handled separately
    }

    private fun getCurrentTime() = Calendar.getInstance().toInstant()

    private fun getRelativeTime(unitOfTime: ChronoUnit?, relTimeNumber: Long): StartEndDate = StartEndDate(getCurrentTime().minus(relTimeNumber, unitOfTime),
        getCurrentTime())

    private fun getAbsoluteTime(startDate: Date, endDate: Date): StartEndDate = StartEndDate(startDate.toInstant(), endDate.toInstant())

    private fun getFilterQuery(searchTerm: String): String {
        if (searchTerm.contains("/")) {
            val regexTerm = searchTerm.replace("/", "\\/")
            return "fields @message, @timestamp | filter @message like /$regexTerm/"
        }
        return "fields @message, @timestamp | filter @message like /$searchTerm/"
    }

    private fun beginQuerying() {
        if (!okAction.isEnabled) {
            return
        }
        val funDetails = getFunctionDetails()
        val queryStartEndDate: StartEndDate
        queryStartEndDate = (if (funDetails.absoluteTimeSelected) {
            getAbsoluteTime(funDetails.startDateAbsolute, funDetails.endDateAbsolute)
        } else {
            getRelativeTime(relativeTimeUnit[funDetails.relativeTimeUnit], funDetails.relativeTimeNumber.toLong())
        })
        val query = if (funDetails.enterQuery) {
            funDetails.query } else {
            getFilterQuery(funDetails.searchTerm)
        }
        close(OK_EXIT_CODE)
        queryingLogGroupApiCall.executeStartQuery(queryStartEndDate, funDetails.logGroupName, query, client)
    }

    private fun getFunctionDetails(): QueryDetails = QueryDetails(
        logGroupName = logGroupNames,
        absoluteTimeSelected = view.absoluteTimeRadioButton.isSelected,
        startDateAbsolute = view.startDate.date,
        endDateAbsolute = view.endDate.date,
        relativeTimeSelected = view.relativeTimeRadioButton.isSelected,
        relativeTimeUnit = view.relativeTimeUnit.selectedItem.toString(),
        relativeTimeNumber = view.relativeTimeNumber.text,
        searchTermSelected = view.searchTerm.isSelected,
        searchTerm = view.querySearchTerm.text,
        enterQuery = view.queryLogGroupsRadioButton.isSelected,
        query = view.queryBox.text
    )

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

    public fun validateEditorEntries(view: QueryEditor): ValidationInfo? {
        if (!view.absoluteTimeRadioButton.isSelected && !view.relativeTimeRadioButton.isSelected) {
            return ValidationInfo(message("cloudwatch.logs.validation.timerange"), view.absoluteTimeRadioButton)
        }
        if (view.relativeTimeRadioButton.isSelected && view.relativeTimeNumber.text.isEmpty()) {
            return ValidationInfo(message("cloudwatch.logs.no_relative_time_number"), view.relativeTimeNumber)
        }
        if (view.absoluteTimeRadioButton.isSelected && view.startDate.date > view.endDate.date) {
            return ValidationInfo(message("cloudwatch.logs.compare.start.end.date"), view.startDate)
        }
        if (!view.queryLogGroupsRadioButton.isSelected && !view.searchTerm.isSelected) {
            return ValidationInfo(message("cloudwatch.logs.no_query_selected"), view.searchTerm)
        }
        if (view.queryLogGroupsRadioButton.isSelected && view.queryBox.text.isEmpty()) {
            return ValidationInfo(message("cloudwatch.logs.no_query_entered"), view.queryBox)
        }
        if (view.searchTerm.isSelected && view.querySearchTerm.text.isEmpty()) {
            return ValidationInfo(message("cloudwatch.logs.no_term_entered"), view.querySearchTerm)
        }
        return null
    }
}
