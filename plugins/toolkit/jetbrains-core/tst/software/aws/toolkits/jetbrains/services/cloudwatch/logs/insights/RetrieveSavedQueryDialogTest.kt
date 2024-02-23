// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights

import com.intellij.testFramework.EdtRule
import com.intellij.testFramework.RuleChain
import com.intellij.testFramework.RunsInEdt
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.cloudwatchlogs.model.QueryDefinition
import software.aws.toolkits.core.ConnectionSettings
import software.aws.toolkits.core.credentials.aToolkitCredentialsProvider
import software.aws.toolkits.core.region.anAwsRegion
import software.aws.toolkits.jetbrains.services.cloudwatch.logs.insights.InsightsUtils.queryDetails
import software.aws.toolkits.jetbrains.utils.rules.JavaCodeInsightTestFixtureRule

@RunsInEdt
class RetrieveSavedQueryDialogTest {
    val projectRule = JavaCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val ruleChain = RuleChain(projectRule, EdtRule())

    private val credentials = aToolkitCredentialsProvider()
    private val region = anAwsRegion()
    private val connectionSettings = ConnectionSettings(credentials, region)

    // need to initialize under EDT with a valid application
    private lateinit var editor: QueryEditor

    @Before
    fun setUp() {
        editor = QueryEditor(
            projectRule.project,
            queryDetails(
                connectionSettings = connectionSettings
            )
        ).also {
            // initialize dummy values
            val groups = listOf("log0", "log1", "log2")
            it.logGroupTable.populateLogGroups(setOf("log1"), groups)
        }
    }

    @Test
    fun populateParentEditor_noLogGroups() {
        val definition = QueryDefinition.builder()
            .queryString("query")
            .build()
        RetrieveSavedQueryDialog.populateParentEditor(editor, definition)

        // no-ops log group selection
        assertThat(editor.logGroupTable.getSelectedLogGroups()).containsExactly("log1")
        assertThat(editor.queryLogGroupsRadioButton.isSelected).isTrue()
        assertThat(editor.queryBox.text).isEqualTo("query")
    }

    @Test
    fun populateParentEditor_withLogGroups() {
        val definition = QueryDefinition.builder()
            .logGroupNames("log0", "log1")
            .queryString("query")
            .build()
        RetrieveSavedQueryDialog.populateParentEditor(editor, definition)

        assertThat(editor.logGroupTable.getSelectedLogGroups()).containsExactly("log0", "log1")
        assertThat(editor.queryLogGroupsRadioButton.isSelected).isTrue()
        assertThat(editor.queryBox.text).isEqualTo("query")
    }
}
