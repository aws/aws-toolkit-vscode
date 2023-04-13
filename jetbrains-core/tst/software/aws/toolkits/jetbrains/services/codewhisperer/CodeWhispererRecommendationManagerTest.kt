// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.project.Project
import com.intellij.testFramework.DisposableRule
import com.intellij.testFramework.fixtures.CodeInsightTestFixture
import com.intellij.testFramework.runInEdtAndGet
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import software.amazon.awssdk.services.codewhispererruntime.model.Reference
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererRecommendationManager
import software.aws.toolkits.jetbrains.utils.rules.PythonCodeInsightTestFixtureRule

class CodeWhispererRecommendationManagerTest {
    @Rule
    @JvmField
    var projectRule = PythonCodeInsightTestFixtureRule()

    @Rule
    @JvmField
    val disposableRule = DisposableRule()

    private val documentContentContent = "012345678"
    private lateinit var fixture: CodeInsightTestFixture
    private lateinit var project: Project
    private val originalReference = Reference.builder()
        .licenseName("test_license")
        .repository("test_repo")
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
    fun `test reformatReference() should generate a new reference with span based on rangeMarker and no surfix newline char`() {
        // invocationOffset and markerStartOffset is of our choice as long as invocationOffset <= markerStartOffset
        val recommendationManager = CodeWhispererRecommendationManager()
        testReformatReferenceUtil(recommendationManager, documentContentSurfix = "", invocationOffset = 2, markerStartOffset = 5)
        testReformatReferenceUtil(recommendationManager, documentContentSurfix = "\n", invocationOffset = 2, markerStartOffset = 5)
        testReformatReferenceUtil(recommendationManager, documentContentSurfix = "\n\n", invocationOffset = 1, markerStartOffset = 4)
    }

    private fun testReformatReferenceUtil(
        recommendationManager: CodeWhispererRecommendationManager,
        documentContentSurfix: String,
        invocationOffset: Int,
        markerStartOffset: Int
    ) {
        // insert newline characters
        WriteCommandAction.runWriteCommandAction(project) {
            fixture.editor.document.insertString(fixture.editor.caretModel.offset, documentContentSurfix)
        }

        val rangeMarker =
            runInEdtAndGet { fixture.editor.document.createRangeMarker(markerStartOffset, documentContentContent.length + documentContentSurfix.length) }

        val reformattedReference = runInEdtAndGet { recommendationManager.reformatReference(originalReference, rangeMarker, invocationOffset) }
        assertThat(reformattedReference.licenseName()).isEqualTo("test_license")
        assertThat(reformattedReference.repository()).isEqualTo("test_repo")
        assertThat(reformattedReference.recommendationContentSpan().start()).isEqualTo(rangeMarker.startOffset - invocationOffset)
        assertThat(reformattedReference.recommendationContentSpan().end()).isEqualTo(rangeMarker.endOffset - invocationOffset - documentContentSurfix.length)
        val span = runInEdtAndGet {
            fixture.editor.document.charsSequence.subSequence(
                reformattedReference.recommendationContentSpan().start(),
                reformattedReference.recommendationContentSpan().end()
            )
        }
        // span should not include newline char
        assertThat(span.last()).isNotEqualTo('\n')
    }
}
