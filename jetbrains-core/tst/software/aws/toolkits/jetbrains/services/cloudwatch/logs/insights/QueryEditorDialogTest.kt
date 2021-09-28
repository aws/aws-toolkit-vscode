// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights

import com.intellij.testFramework.runInEdtAndGet
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.within
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.stub
import org.mockito.kotlin.verify
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.amazon.awssdk.services.cloudwatchlogs.model.LogGroup
import software.amazon.awssdk.services.cloudwatchlogs.model.StartQueryRequest
import software.amazon.awssdk.services.cloudwatchlogs.model.StartQueryResponse
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.core.credentials.aToolkitCredentialsProvider
import software.aws.toolkits.core.region.anAwsRegion
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights.InsightsUtils.queryDetails
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.resources.CloudWatchResources
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import software.aws.toolkits.resources.message
import java.time.Duration
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.Calendar
import java.util.Date

class QueryEditorDialogTest {
    @Rule
    @JvmField
    val projectRule = JavaCodeInsightTestFixtureRule()

    @JvmField
    @Rule
    val mockClientManagerRule = MockClientManagerRule()

    @JvmField
    @Rule
    val mockResourceCache = MockResourceCacheRule()

    private lateinit var view: QueryEditor
    private lateinit var sut: QueryEditorDialog
    private lateinit var client: CloudWatchLogsClient

    private val credentials = aToolkitCredentialsProvider()
    private val region = anAwsRegion()
    private val connectionSettings = ConnectionSettings(credentials, region)

    @Before
    fun setUp() {
        val project = projectRule.project
        client = mockClientManagerRule.create()
        mockResourceCache.addEntry(
            CloudWatchResources.LIST_LOG_GROUPS,
            region.id,
            credentials.id,
            listOf(LogGroup.builder().logGroupName("log1").build())
        )
        view = QueryEditor(
            project,
            queryDetails(
                connectionSettings = connectionSettings,
                logGroups = listOf()
            )
        )
        sut = runInEdtAndGet { QueryEditorDialog(project, connectionSettings, "log1") }
        runBlocking {
            // annoying race between view initialization and test assertion
            sut.setView(
                queryDetails(
                    connectionSettings = connectionSettings,
                    logGroups = listOf("log1")
                )
            )
        }

        client.stub {
            on(it.startQuery(any<StartQueryRequest>())).thenReturn(
                StartQueryResponse.builder().queryId("queryId").build()
            )
        }
    }

    @Test
    fun `Dialog selects correct log groups`() {
        mockResourceCache.addEntry(
            CloudWatchResources.LIST_LOG_GROUPS,
            region.id,
            credentials.id,
            listOf(
                LogGroup.builder().logGroupName("log0").build(),
                LogGroup.builder().logGroupName("log1").build(),
                LogGroup.builder().logGroupName("log2").build()
            )
        )
        assertThat(sut.getQueryDetails().logGroups).containsExactly("log1")
    }

    @Test
    fun `Dialog selects multiple log groups`() {
        mockResourceCache.addEntry(
            CloudWatchResources.LIST_LOG_GROUPS,
            region.id,
            credentials.id,
            listOf(
                LogGroup.builder().logGroupName("log0").build(),
                LogGroup.builder().logGroupName("log1").build(),
                LogGroup.builder().logGroupName("log2").build()
            )
        )
        runBlocking {
            val queryDetails = queryDetails(
                connectionSettings = connectionSettings,
                logGroups = listOf("log0", "log1")
            )
            sut = runInEdtAndGet { QueryEditorDialog(projectRule.project, queryDetails) }
            sut.setView(queryDetails)
        }
        assertThat(sut.getQueryDetails().logGroups).containsExactly("log0", "log1")
    }

    @Test
    fun `Dialog selects relative time correctly`() {
        runBlocking {
            val details = queryDetails(
                connectionSettings = connectionSettings,
                timeRange = TimeRange.RelativeRange(72761, ChronoUnit.DAYS)
            )
            sut.setView(details)
        }

        assertThat(sut.getQueryDetails().timeRange).isInstanceOfSatisfying(TimeRange.RelativeRange::class.java) {
            assertThat(it.relativeTimeAmount).isEqualTo(72761)
            assertThat(it.relativeTimeUnit).isEqualTo(ChronoUnit.DAYS)
        }
    }

    @Test
    fun `Dialog selects absolute time correctly`() {
        runBlocking {
            val details = queryDetails(
                connectionSettings = connectionSettings,
                timeRange = TimeRange.AbsoluteRange(
                    startDate = Date(1),
                    endDate = Date(1000000)
                )
            )
            sut.setView(details)
        }

        assertThat(sut.getQueryDetails().timeRange).isInstanceOfSatisfying(TimeRange.AbsoluteRange::class.java) {
            assertThat(it.startDate).isEqualTo(Date(1))
            assertThat(it.endDate).isEqualTo(Date(1000000))
        }
    }

    @Test
    fun `Dialog selects insights query box correctly`() {
        runBlocking {
            val details = queryDetails(
                connectionSettings = connectionSettings,
                query = QueryString.InsightsQueryString("insights query")
            )
            sut.setView(details)
        }

        assertThat(sut.getQueryDetails().query).isInstanceOfSatisfying(QueryString.InsightsQueryString::class.java) {
            assertThat(it.query).isEqualTo("insights query")
        }
    }

    @Test
    fun `Dialog selects search term box correctly`() {
        runBlocking {
            val details = queryDetails(
                connectionSettings = connectionSettings,
                query = QueryString.SearchTermQueryString("search term")

            )
            sut.setView(details)
        }

        assertThat(sut.getQueryDetails().query).isInstanceOfSatisfying(QueryString.SearchTermQueryString::class.java) {
            assertThat(it.searchTerm).isEqualTo("search term")
        }
    }

    @Test
    fun `validates absolute or relative time selected`() {
        setViewDetails(absoluteTime = false, relativeTime = false)
        assertThat(sut.validateEditorEntries(view)?.message).contains(message("cloudwatch.logs.validation.timerange"))
    }

    @Test
    fun `validates start date must be before end date`() {
        val cal = Calendar.getInstance()
        cal.add(Calendar.DATE, -1)
        setViewDetails(absoluteTime = true, startDate = Calendar.getInstance().time, endDate = cal.time)
        assertThat(sut.validateEditorEntries(view)?.message).contains(message("cloudwatch.logs.compare.start.end.date"))
    }

    @Test
    fun `validates unit specified for relative time`() {
        setViewDetails(relativeTime = true, relativeTimeNumber = "")
        assertThat(sut.validateEditorEntries(view)?.message).contains(message("cloudwatch.logs.no_relative_time_number"))
    }

    @Test
    fun `Search query type is always selected`() {
        setViewDetails(relativeTime = true)
        assertThat(!view.queryLogGroupsRadioButton.isSelected && !view.searchTerm.isSelected).isFalse()

        view.queryLogGroupsRadioButton.doClick()
        assertThat(view.queryLogGroupsRadioButton.isSelected).isTrue()
        assertThat(view.searchTerm.isSelected).isFalse()

        view.searchTerm.doClick()
        assertThat(view.queryLogGroupsRadioButton.isSelected).isFalse()
        assertThat(view.searchTerm.isSelected).isTrue()
    }

    @Test
    fun `validates search term entered`() {
        setViewDetails(relativeTime = true, querySearch = true, searchTerm = "")
        assertThat(sut.validateEditorEntries(view)?.message).contains(message("cloudwatch.logs.no_term_entered"))
    }

    @Test
    fun `validates query entered`() {
        setViewDetails(relativeTime = true, queryLogs = true, query = "")
        assertThat(sut.validateEditorEntries(view)?.message).contains(message("cloudwatch.logs.no_query_entered"))
    }

    @Test
    fun `validates log groups selected`() {
        setViewDetails(relativeTime = true, logGroups = emptyList())
        assertThat(sut.validateEditorEntries(view)?.message).contains(message("cloudwatch.logs.no_log_group"))
    }

    @Test
    fun `Path with relative time and queries correctly entered gets executed`() {
        setViewDetails(relativeTime = true, queryLogs = true, query = "fields @timestamp")
        assertThat(sut.validateEditorEntries(view)?.message).isNull()
    }

    @Test
    fun `Path with absolute time and a search term entered gets executed`() {
        val cal = Calendar.getInstance()
        cal.add(Calendar.DATE, -1)
        setViewDetails(absoluteTime = true, endDate = Calendar.getInstance().time, startDate = cal.time, querySearch = true, searchTerm = "Error")
        assertThat(sut.validateEditorEntries(view)?.message).isNull()
    }

    @Test
    fun `Fields extracted correctly from query string`() {
        val fieldsAsSecondPartOfQuery = "filter @message like /Error/ | fields @message"
        val noFieldsQuery = "filter @message like /Error/"
        val onlyFieldsQuery = "fields @logStream, @timestamp"
        val twoFieldsQuery = "fields @timestamp, @logStream | limit 10 | fields @message"
        val fieldsInFilterQuery = "filter @message like /fields/ | fields @logStream"
        assertThat(QueryEditorDialog.getFields(fieldsAsSecondPartOfQuery)).isEqualTo(listOf("@message"))
        assertThat(QueryEditorDialog.getFields(noFieldsQuery)).isEqualTo(listOf("@timestamp", "@message"))
        assertThat(QueryEditorDialog.getFields(onlyFieldsQuery)).isEqualTo(listOf("@logStream", "@timestamp"))
        assertThat(QueryEditorDialog.getFields(twoFieldsQuery)).isEqualTo(listOf("@timestamp", "@logStream", "@message"))
        assertThat(QueryEditorDialog.getFields(fieldsInFilterQuery)).isEqualTo(listOf("@logStream"))
    }

    @Test
    fun `startQuery with multiple log groups`() {
        val query = queryDetails(
            connectionSettings = connectionSettings,
            logGroups = mutableListOf("logGroup", "anotherLogGroup")
        )

        runBlocking { sut.startQueryAsync(query).await() }

        val captor = argumentCaptor<StartQueryRequest>()
        verify(client).startQuery(captor.capture())

        captor.firstValue.let {
            assertThat(it.logGroupNames()).containsExactly("logGroup", "anotherLogGroup")
        }
    }

    @Test
    fun `startQuery with absolute time range`() {
        val end = Instant.now()
        val start = end.minus(Duration.ofDays(1))
        val query = queryDetails(
            connectionSettings = connectionSettings,
            timeRange = TimeRange.AbsoluteRange(Date.from(start), Date.from(end))
        )

        runBlocking { sut.startQueryAsync(query).await() }

        val captor = argumentCaptor<StartQueryRequest>()
        verify(client).startQuery(captor.capture())

        captor.firstValue.let {
            assertThat(it.logGroupNames()).containsExactly("logGroup")
            assertThat(it.startTime()).isEqualTo(start.epochSecond)
            assertThat(it.endTime()).isEqualTo(end.epochSecond)
            assertThat(it.queryString()).isEqualTo("query")
        }
    }

    @Test
    fun `startQuery with relative time range`() {
        val end = Instant.now()
        val start = end.minus(Duration.ofDays(1))
        val query = queryDetails(
            connectionSettings = connectionSettings,
            timeRange = TimeRange.RelativeRange(1, ChronoUnit.DAYS)
        )

        runBlocking { sut.startQueryAsync(query).await() }

        val captor = argumentCaptor<StartQueryRequest>()
        verify(client).startQuery(captor.capture())

        captor.firstValue.let {
            assertThat(it.logGroupNames()).containsExactly("logGroup")
            // 5 second leeway since the actual timestamps are calculated at time of execution
            assertThat(it.startTime()).isCloseTo(start.epochSecond, within(5L))
            assertThat(it.endTime()).isCloseTo(end.epochSecond, within(5L))
            assertThat(it.queryString()).isEqualTo("query")
        }
    }

    @Test
    fun `startQuery with search term`() {
        val query = queryDetails(
            connectionSettings = connectionSettings,
            query = QueryString.SearchTermQueryString("query")
        )

        runBlocking { sut.startQueryAsync(query).await() }

        val captor = argumentCaptor<StartQueryRequest>()
        verify(client).startQuery(captor.capture())

        captor.firstValue.let {
            assertThat(it.logGroupNames()).containsExactly("logGroup")
            assertThat(it.queryString()).isEqualTo("fields @timestamp, @message | filter @message like /query/")
        }
    }

    @Test
    fun `startQuery with Insights query language query`() {
        val query = queryDetails(
            connectionSettings = connectionSettings,
            query = QueryString.InsightsQueryString("query")
        )

        runBlocking { sut.startQueryAsync(query).await() }

        val captor = argumentCaptor<StartQueryRequest>()
        verify(client).startQuery(captor.capture())

        captor.firstValue.let {
            assertThat(it.logGroupNames()).containsExactly("logGroup")
            assertThat(it.queryString()).isEqualTo("query")
        }
    }

    private fun setViewDetails(
        logGroups: List<String> = listOf("log1"),
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
        view.logGroupTable.populateLogGroups(logGroups.toSet(), logGroups)
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
}
