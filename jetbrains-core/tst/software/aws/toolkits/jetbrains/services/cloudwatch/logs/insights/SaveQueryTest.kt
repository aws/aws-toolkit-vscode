// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights

import com.intellij.testFramework.EdtRule
import com.intellij.testFramework.RuleChain
import com.intellij.testFramework.RunsInEdt
import com.nhaarman.mockitokotlin2.argumentCaptor
import com.nhaarman.mockitokotlin2.doReturn
import com.nhaarman.mockitokotlin2.stub
import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.amazon.awssdk.services.cloudwatchlogs.model.DescribeQueryDefinitionsRequest
import software.amazon.awssdk.services.cloudwatchlogs.model.DescribeQueryDefinitionsResponse
import software.amazon.awssdk.services.cloudwatchlogs.model.PutQueryDefinitionRequest
import software.amazon.awssdk.services.cloudwatchlogs.model.PutQueryDefinitionResponse
import software.amazon.awssdk.services.cloudwatchlogs.model.QueryDefinition
import software.aws.toolkits.core.credentials.aToolkitCredentialsProvider
import software.aws.toolkits.core.region.anAwsRegion
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.core.credentials.ConnectionSettings
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
    val mockClientManagerRule = MockClientManagerRule(projectRule)

    private val credentials = aToolkitCredentialsProvider()
    private val region = anAwsRegion()
    private val connectionSettings = ConnectionSettings(credentials, region)
    @Test
    fun `Query name not entered, error message displayed`() {
        val project = projectRule.project
        val view = EnterQueryName()
        mockClientManagerRule.create<CloudWatchLogsClient>()
        val validator = SaveQueryDialog(project, connectionSettings, "fields @timestamp", listOf("log1"))
        view.queryName.text = ""
        assertThat(validator.validateQueryName(view)?.message).contains(message("cloudwatch.logs.query_name"))
    }

    @Test
    fun `Path with correctly entered Query name returns no validation error`() {
        val project = projectRule.project
        val view = EnterQueryName()
        mockClientManagerRule.create<CloudWatchLogsClient>()
        val validator = SaveQueryDialog(project, connectionSettings, "fields @timestamp", listOf("log1"))
        view.queryName.text = "TrialQuery"
        assertThat(validator.validateQueryName(view)?.message).isNull()
    }

    @Test
    fun `Save query API Call test`() {
        val putQueryDefinitionCaptor = argumentCaptor<PutQueryDefinitionRequest>()
        val describeQueryDefinitionCaptor = argumentCaptor<DescribeQueryDefinitionsRequest>()
        val client = mockClientManagerRule.create<CloudWatchLogsClient>()
        val testQueryDefinition = QueryDefinition.builder().name("SampleQuery").queryDefinitionId("1234").build()
        client.stub {
            on { putQueryDefinition(putQueryDefinitionCaptor.capture()) } doReturn PutQueryDefinitionResponse.builder().queryDefinitionId("1234").build()
        }
        client.stub {
            on { describeQueryDefinitions(describeQueryDefinitionCaptor.capture()) } doReturn
                DescribeQueryDefinitionsResponse.builder().queryDefinitions(testQueryDefinition).build()
        }
        val dialog = SaveQueryDialog(projectRule.project, connectionSettings, "fields @timestamp", listOf("log1"))
        dialog.saveQuery()
        assertThat(dialog.checkQueryName("SampleQuery")).isFalse()
    }
}
