// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights

import com.intellij.testFramework.RunsInEdt
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import software.aws.toolkits.resources.message
import java.util.Calendar
import java.util.Date

@RunsInEdt
class QueryingLogGroupsTest {
    @JvmField
    @Rule
    val projectRule = JavaCodeInsightTestFixtureRule()

    @JvmField
    @Rule
    val mockClientManagerRule = MockClientManagerRule(projectRule)
    private lateinit var view: QueryEditor
    private lateinit var validator: QueryEditorDialog
    private lateinit var client: CloudWatchLogsClient

    @Test
    fun `Absolute or relative time selected`() {
        runInEdtAndWait {
            getValidator()
            getViewDetails(absoluteTime = false, relativeTime = false)
            assertThat(validator.validateEditorEntries(view)?.message).contains(message("cloudwatch.logs.validation.timerange"))
        }
    }

    @Test
    fun `Start date must be before end date`() {
        runInEdtAndWait {
            getValidator()
            val cal = Calendar.getInstance()
            cal.add(Calendar.DATE, -1)
            getViewDetails(absoluteTime = true, startDate = Calendar.getInstance().time, endDate = cal.time)
            assertThat(validator.validateEditorEntries(view)?.message).contains(message("cloudwatch.logs.compare.start.end.date"))
        }
    }

    @Test
    fun `Relative Time, no time entered`() {
        runInEdtAndWait {
            getValidator()
            getViewDetails(relativeTime = true, relativeTimeNumber = "")
            assertThat(validator.validateEditorEntries(view)?.message).contains(message("cloudwatch.logs.no_relative_time_number"))
        }
    }

    @Test
    fun `Neither Search Term nor Querying through log groups selected`() {
        runInEdtAndWait {
            getValidator()
            getViewDetails(relativeTime = true)
            assertThat(validator.validateEditorEntries(view)?.message).contains(message("cloudwatch.logs.no_query_selected"))
        }
    }

    @Test
    fun `No search term entered`() {
        runInEdtAndWait {
            getValidator()
            getViewDetails(relativeTime = true, querySearch = true, searchTerm = "")
            assertThat(validator.validateEditorEntries(view)?.message).contains(message("cloudwatch.logs.no_term_entered"))
        }
    }

    @Test
    fun `No query entered`() {
        runInEdtAndWait {
            getValidator()
            getViewDetails(relativeTime = true, queryLogs = true, query = "")
            assertThat(validator.validateEditorEntries(view)?.message).contains(message("cloudwatch.logs.no_query_entered"))
        }
    }

    @Test
    fun `Path with relative time and queries correctly entered gets executed`() {
        runInEdtAndWait {
            getValidator()
            getViewDetails(relativeTime = true, queryLogs = true, query = "fields @timestamp")
            assertThat(validator.validateEditorEntries(view)?.message).isNull()
        }
    }

    @Test
    fun `Path with absolute time and a search term entered gets executed`() {
        runInEdtAndWait {
            getValidator()
            val cal = Calendar.getInstance()
            cal.add(Calendar.DATE, -1)
            getViewDetails(absoluteTime = true, endDate = Calendar.getInstance().time, startDate = cal.time, querySearch = true, searchTerm = "Error")
            assertThat(validator.validateEditorEntries(view)?.message).isNull()
        }
    }

    private fun getViewDetails(
        absoluteTime: Boolean = false,
        relativeTime: Boolean = false,
        startDate: Date = Calendar.getInstance().time,
        endDate: Date = Calendar.getInstance().time,
        relativeTimeUnit: String = "Minutes",
        relativeTimeNumber: String = "1",
        querySearch: Boolean = false,
        queryLogs: Boolean = false,
        searchTerm: String = "Example",
        query: String = "Example Query"
    ) {
        view.relativeTimeRadioButton.isSelected = relativeTime
        view.endDate.date = endDate
        view.startDate.date = startDate
        view.absoluteTimeRadioButton.isSelected = absoluteTime
        view.relativeTimeUnit.selectedItem = relativeTimeUnit
        view.relativeTimeNumber.text = relativeTimeNumber
        view.queryLogGroupsRadioButton.isSelected = queryLogs
        view.searchTerm.isSelected = querySearch
        view.querySearchTerm.text = searchTerm
        view.queryBox.text = query
    }

    private fun getValidator() {
        val project = projectRule.project
        view = QueryEditor(project)
        client = mockClientManagerRule.create()
        validator = QueryEditorDialog(project, "log1", client, displayInitialParameters = true)
    }
}
