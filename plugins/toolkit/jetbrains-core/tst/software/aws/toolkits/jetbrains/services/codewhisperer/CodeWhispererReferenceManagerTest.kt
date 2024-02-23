// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.openapi.project.Project
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.fixtures.CodeInsightTestFixture
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.codewhispererruntime.model.Completion
import software.amazon.awssdk.services.codewhispererruntime.model.Reference
import software.amazon.awssdk.services.codewhispererruntime.model.Span
import software.aws.toolkits.jetbrains.services.codewhisperer.toolwindow.CodeWhispererCodeReferenceManager
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule

class CodeWhispererReferenceManagerTest {
    @Rule
    @JvmField
    var projectRule = PythonCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    private val documentContentContent = "012345678\n9"
    private lateinit var fixture: CodeInsightTestFixture
    private lateinit var project: Project
    private val originalReference = Reference.builder()
        .licenseName("test_license")
        .repository("test_repo")
        .recommendationContentSpan(
            Span.builder().start(0).end(14).build()
        )
        .build()

    private val recommendation = Completion.builder()
        .references(originalReference)
        .content("test\nreference")
        .build()

    @Before
    fun setup() {
        fixture = projectRule.fixture
        project = projectRule.project

        fixture.configureByText("test.py", documentContentContent)
        runInEdtAndWait {
            fixture.editor.caretModel.moveToOffset(documentContentContent.length)
        }
    }

    @Test
    fun `test getReferenceLineNums return expected line numbers`() {
        val referenceManager = CodeWhispererCodeReferenceManager(project)
        assertThat(referenceManager.getReferenceLineNums(fixture.editor, 0, 1)).isEqualTo("1")
        assertThat(referenceManager.getReferenceLineNums(fixture.editor, 0, 10)).isEqualTo("1 to 2")
    }

    @Test
    fun `test getOriginalContent lines returns full reference lines`() {
        val referenceManager = CodeWhispererCodeReferenceManager(project)
        val expectedRecommendation = listOf<String>("test", "reference")
        assertThat(referenceManager.getOriginalContentLines(recommendation, 0)).isEqualTo(expectedRecommendation)
    }
}
