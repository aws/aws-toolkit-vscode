// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights

import com.intellij.testFramework.EdtRule
import com.intellij.testFramework.RuleChain
import com.intellij.testFramework.RunsInEdt
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.doReturn
import org.mockito.kotlin.doThrow
import org.mockito.kotlin.stub
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.amazon.awssdk.services.cloudwatchlogs.model.CloudWatchLogsException
import software.amazon.awssdk.services.cloudwatchlogs.model.PutQueryDefinitionRequest
import software.amazon.awssdk.services.cloudwatchlogs.model.PutQueryDefinitionResponse
import software.amazon.awssdk.services.cloudwatchlogs.model.QueryDefinition
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.core.credentials.aToolkitCredentialsProvider
import software.aws.toolkits.core.region.anAwsRegion
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.MockResourceCacheRule
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.resources.CloudWatchResources
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import software.aws.toolkits.resources.message

@RunsInEdt
class SaveQueryTest {
    val projectRule = JavaCodeInsightTestFixtureRule()

    @JvmField
    @Rule
    val ruleChain = RuleChain(projectRule, EdtRule())

    @JvmField
    @Rule
    val mockClientManagerRule = MockClientManagerRule()

    @JvmField
    @Rule
    val resourceCache = MockResourceCacheRule()

    private val credentials = aToolkitCredentialsProvider()
    private val region = anAwsRegion()
    private val connectionSettings = ConnectionSettings(credentials, region)
    private lateinit var client: CloudWatchLogsClient

    @Before
    fun setUp() {
        client = mockClientManagerRule.create()
    }

    @Test
    fun `Query name not entered, error message displayed`() {
        val project = projectRule.project
        val view = EnterQueryName()
        val validator = SaveQueryDialog(project, connectionSettings, "fields @timestamp", listOf("log1"))
        view.queryName.text = ""
        assertThat(validator.validateQueryName(view)?.message).contains(message("cloudwatch.logs.query_name_missing"))
    }

    @Test
    fun `Path with correctly entered Query name returns no validation error`() {
        val project = projectRule.project
        val view = EnterQueryName()
        val validator = SaveQueryDialog(project, connectionSettings, "fields @timestamp", listOf("log1"))
        view.queryName.text = "TrialQuery"
        assertThat(validator.validateQueryName(view)?.message).isNull()
    }

    @Test
    fun `Save new query`() {
        val putQueryDefinitionCaptor = argumentCaptor<PutQueryDefinitionRequest>()
        client.stub {
            on { putQueryDefinition(putQueryDefinitionCaptor.capture()) } doReturn PutQueryDefinitionResponse.builder().queryDefinitionId("1234").build()
        }
        resourceCache.addEntry(CloudWatchResources.DESCRIBE_QUERY_DEFINITIONS, region.id, credentials.id, listOf())

        val dialog = SaveQueryDialog(projectRule.project, connectionSettings, "fields @timestamp", listOf("log1"))
        dialog.view.queryName.text = "queryName"
        runBlocking {
            dialog.saveQuery().join()
        }

        assertThat(putQueryDefinitionCaptor.allValues).hasSize(1)
        assertThat(putQueryDefinitionCaptor.firstValue.queryDefinitionId()).isEqualTo(null)
        assertThat(putQueryDefinitionCaptor.firstValue.name()).isEqualTo("queryName")
        assertThat(putQueryDefinitionCaptor.firstValue.logGroupNames()).containsExactly("log1")
        assertThat(putQueryDefinitionCaptor.firstValue.queryString()).isEqualTo("fields @timestamp")
    }

    @Test
    fun `Save query when name already exists`() {
        val putQueryDefinitionCaptor = argumentCaptor<PutQueryDefinitionRequest>()
        val client = mockClientManagerRule.create<CloudWatchLogsClient>()
        val testQueryDefinition = QueryDefinition.builder().name("SampleQuery").queryDefinitionId("1234").build()
        client.stub {
            on { putQueryDefinition(putQueryDefinitionCaptor.capture()) } doReturn PutQueryDefinitionResponse.builder().queryDefinitionId("1234").build()
        }
        resourceCache.addEntry(CloudWatchResources.DESCRIBE_QUERY_DEFINITIONS, region.id, credentials.id, listOf(testQueryDefinition))

        val dialog = SaveQueryDialog(projectRule.project, connectionSettings, "fields @timestamp", listOf("log1"))
        dialog.view.queryName.text = "SampleQuery"
        runBlocking {
            dialog.saveQuery().join()
        }

        assertThat(putQueryDefinitionCaptor.allValues).hasSize(1)
        assertThat(putQueryDefinitionCaptor.firstValue.queryDefinitionId()).isEqualTo("1234")
        assertThat(putQueryDefinitionCaptor.firstValue.name()).isEqualTo("SampleQuery")
        assertThat(putQueryDefinitionCaptor.firstValue.logGroupNames()).containsExactly("log1")
        assertThat(putQueryDefinitionCaptor.firstValue.queryString()).isEqualTo("fields @timestamp")
    }

    @Test
    fun `Save query doesn't throw on failure`() {
        val putQueryDefinitionCaptor = argumentCaptor<PutQueryDefinitionRequest>()
        val client = mockClientManagerRule.create<CloudWatchLogsClient>()
        val testQueryDefinition = QueryDefinition.builder().name("SampleQuery").queryDefinitionId("1234").build()
        client.stub {
            on { putQueryDefinition(putQueryDefinitionCaptor.capture()) } doThrow CloudWatchLogsException::class
        }
        resourceCache.addEntry(CloudWatchResources.DESCRIBE_QUERY_DEFINITIONS, region.id, credentials.id, listOf(testQueryDefinition))

        val dialog = SaveQueryDialog(projectRule.project, connectionSettings, "fields @timestamp", listOf("log1"))
        dialog.view.queryName.text = "SampleQuery"
        runBlocking {
            dialog.saveQuery().join()
        }
    }
}
