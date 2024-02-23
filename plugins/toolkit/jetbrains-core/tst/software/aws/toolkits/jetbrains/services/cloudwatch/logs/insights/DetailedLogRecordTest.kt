// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights

import com.intellij.testFramework.EdtRule
import com.intellij.testFramework.RuleChain
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import org.assertj.core.api.Assertions.assertThat
import org.assertj.core.api.Assertions.assertThatThrownBy
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.whenever
import software.amazon.awssdk.services.cloudwatchlogs.CloudWatchLogsClient
import software.amazon.awssdk.services.cloudwatchlogs.model.CloudWatchLogsException
import software.amazon.awssdk.services.cloudwatchlogs.model.GetLogRecordRequest
import software.amazon.awssdk.services.cloudwatchlogs.model.GetLogRecordResponse
import software.aws.toolkits.jetbrains.core.MockClientManagerRule
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule
import software.aws.toolkits.jetbrains.utils.waitForModelToBeAtLeast

class DetailedLogRecordTest {
    val projectRule = JavaCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val ruleChain = RuleChain(projectRule, EdtRule())

    @JvmField
    @Rule
    val mockClientManagerRule = MockClientManagerRule()

    private lateinit var client: CloudWatchLogsClient

    @Before
    fun setUp() {
        client = mockClientManagerRule.create()
    }

    @Test
    fun `Loads record into table`() {
        whenever(client.getLogRecord(any<GetLogRecordRequest>()))
            .thenReturn(
                GetLogRecordResponse.builder().logRecord(mapOf("field" to "value", "message" to "message")).build()
            )
        val sut = DetailedLogRecord(projectRule.project, client, "ptr")
        val model = sut.tableView.listTableModel

        runBlocking {
            model.waitForModelToBeAtLeast(1)
        }

        assertThat(model.items).containsExactlyInAnyOrder("field" to "value", "message" to "message")
    }

    @Test
    fun `Does not throw on client exception`() {
        whenever(client.getLogRecord(any<GetLogRecordRequest>()))
            .thenThrow(CloudWatchLogsException::class.java)

        val sut = DetailedLogRecord(projectRule.project, client, "ptr")
        runBlocking {
            while (!sut.isLoaded()) {
                delay(10)
            }
        }

        assertThat(sut.tableView.listTableModel.items).isEmpty()
    }

    @Test
    fun getLogGroup() {
        assertThat(DetailedLogRecord.extractLogGroup("123456789012:/log/group/name")).isEqualTo("/log/group/name")
        assertThat(DetailedLogRecord.extractLogGroup("123456789012:1./group_with#symbols-name")).isEqualTo("1./group_with#symbols-name")

        assertThatThrownBy { DetailedLogRecord.extractLogGroup("123456789012:") }.isInstanceOf(IllegalStateException::class.java)
        assertThatThrownBy { DetailedLogRecord.extractLogGroup("/name") }.isInstanceOf(IllegalStateException::class.java)
        assertThatThrownBy { DetailedLogRecord.extractLogGroup("123:/name") }.isInstanceOf(IllegalStateException::class.java)
    }
}
