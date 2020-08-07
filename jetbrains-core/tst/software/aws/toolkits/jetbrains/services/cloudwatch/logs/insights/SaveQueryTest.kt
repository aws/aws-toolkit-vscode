// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights

import com.intellij.testFramework.RunsInEdt
import com.intellij.testFramework.runInEdtAndWait
import com.nhaarman.mockitokotlin2.argumentCaptor
import com.nhaarman.mockitokotlin2.doReturn
import com.nhaarman.mockitokotlin2.stub
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import software.aws.toolkits.resources.message
import org.assertj.core.api.Assertions.assertThat
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.amazon.awssdk.services.cloudwatchlogs.model.QueryDefinition
import software.amazon.awssdk.services.cloudwatchlogs.model.PutQueryDefinitionRequest
import software.amazon.awssdk.services.cloudwatchlogs.model.PutQueryDefinitionResponse
import software.amazon.awssdk.services.cloudwatchlogs.model.DescribeQueryDefinitionsRequest
import software.amazon.awssdk.services.cloudwatchlogs.model.DescribeQueryDefinitionsResponse
import software.aws.toolkits.jetbrains.core.MockClientManagerRule

@RunsInEdt
class SaveQueryTest {
    @JvmField
    @Rule
    val projectRule = JavaCodeInsightTestFixtureRule()
    @JvmField
    @Rule
    val mockClientManagerRule = MockClientManagerRule(projectRule)
    private lateinit var client: CloudWatchLogsClient
    private lateinit var view: EnterQueryName
    private lateinit var validator: SaveQueryDialog

    @Test
    fun `Query name not entered, error message displayed`() {
        runInEdtAndWait {
            val project = projectRule.project
            view = EnterQueryName(project)
            client = mockClientManagerRule.create()
            validator = SaveQueryDialog(project, "fields @timestamp", listOf("log1"), client)
            view.queryName.text = ""
            assertThat(validator.validateQueryName(view)?.message).contains(message("cloudwatch.logs.query_name"))
        }
    }

    @Test
    fun `Path with correctly entered Query name returns no validation error`() {
        runInEdtAndWait {
            val project = projectRule.project
            view = EnterQueryName(project)
            client = mockClientManagerRule.create()
            validator = SaveQueryDialog(project, "fields @timestamp", listOf("log1"), client)
            view.queryName.text = "TrialQuery"
            assertThat(validator.validateQueryName(view)?.message).isNull()
        }
    }

    @Test
    fun `Save query API Call test`() {
        val putQueryDefinitionCaptor = argumentCaptor<PutQueryDefinitionRequest>()
        val describeQueryDefinitionCaptor = argumentCaptor<DescribeQueryDefinitionsRequest>()
        client = mockClientManagerRule.create()
        val testQueryDefinition = QueryDefinition.builder().name("SampleQuery").queryDefinitionId("1234").build()
        client.stub {
            on { putQueryDefinition(putQueryDefinitionCaptor.capture()) } doReturn PutQueryDefinitionResponse.builder().queryDefinitionId("1234").build()
        }
        client.stub {
            on { describeQueryDefinitions(describeQueryDefinitionCaptor.capture()) } doReturn
                DescribeQueryDefinitionsResponse.builder().queryDefinitions(testQueryDefinition).build()
        }
        lateinit var dialog: SaveQueryDialog
        runInEdtAndWait {
            dialog = SaveQueryDialog(project = projectRule.project, query = "fields @timestamp", logGroups = listOf("log1"), client = client)
            dialog.saveQuery()
            assertThat(dialog.checkQueryName("SampleQuery")).isFalse()
        }
    }
}
