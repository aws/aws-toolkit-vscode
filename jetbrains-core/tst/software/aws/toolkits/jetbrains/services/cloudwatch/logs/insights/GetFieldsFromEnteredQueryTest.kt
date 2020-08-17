// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights

import org.assertj.core.api.Assertions.assertThat
import org.junit.Rule
import org.junit.Test
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule

class GetFieldsFromEnteredQueryTest {
    @JvmField
    @Rule
    val projectRule = JavaCodeInsightTestFixtureRule()

    @Test
    fun `Fields extracted correctly from query string`() {
        val query = QueryingLogGroups(projectRule.project)
        val fieldsAsSecondPartOfQuery = "filter @message like /Error/ | fields @message"
        val noFieldsQuery = "filter @message like /Error/"
        val onlyFieldsQuery = "fields @logStream, @timestamp"
        val twoFieldsQuery = "fields @timestamp, @logStream | limit 10 | fields @message"
        val fieldsInFilterQuery = "filter @message like /fields/ | fields @logStream"
        assertThat(query.getFields(fieldsAsSecondPartOfQuery)).isEqualTo(listOf("@message"))
        assertThat(query.getFields(noFieldsQuery)).isEqualTo(listOf("@message", "@timestamp"))
        assertThat(query.getFields(onlyFieldsQuery)).isEqualTo(listOf("@logStream", "@timestamp"))
        assertThat(query.getFields(twoFieldsQuery)).isEqualTo(listOf("@timestamp", "@logStream", "@message"))
        assertThat(query.getFields(fieldsInFilterQuery)).isEqualTo(listOf("@logStream"))
    }
}
