// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.pythonFileName
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.pythonTestLeftContext

class CodeWhispererTypeaheadTest : CodeWhispererTestBase() {

    @Test
    fun `test typing typeahead should update typeahead state when no right context`() {
        testTypingTypeaheadMatchingRecommendationShouldMatchRightContext("")
    }

    @Test
    fun `test typing typeahead should update typeahead state when there is right context with extra opening bracket`() {
        val testRightContext = "() {\n"
        testTypingTypeaheadMatchingRecommendationShouldMatchRightContext(testRightContext)
    }

    @Test
    fun `test typing typeahead should update typeahead state when there is right context with extra closing bracket`() {
        val testRightContext = "() }"
        testTypingTypeaheadMatchingRecommendationShouldMatchRightContext(testRightContext)
    }

    @Test
    fun `test typing typeahead should update typeahead state when there is right context with trailing spaces`() {
        val testRightContext = "() {\n    }      "
        testTypingTypeaheadMatchingRecommendationShouldMatchRightContext(testRightContext)
    }

    @Test
    fun `test typing blank typeahead should correctly update typeahead state`() {
        val testTypeaheadOriginal = "     "
        testTypingTypeaheadWithLeadingSpaceShouldMatchTypeaheadStateCorrectly(testTypeaheadOriginal, 5, 1)
    }

    @Test
    fun `test typing typeahead with leading spaces and matching suffix should correctly update typeahead state`() {
        val testTypeaheadOriginal = "   test"
        testTypingTypeaheadWithLeadingSpaceShouldMatchTypeaheadStateCorrectly(testTypeaheadOriginal, 3, 3)
    }

    private fun testTypingTypeaheadWithLeadingSpaceShouldMatchTypeaheadStateCorrectly(
        expectedTypeaheadOriginal: String,
        expectedNumOfValidRecommendation: Int,
        expectedSelectedAfterBackspace: Int
    ) {
        withCodeWhispererServiceInvokedAndWait { states ->
            val editor = projectRule.fixture.editor
            val startOffset = editor.caretModel.offset
            expectedTypeaheadOriginal.forEach { char ->
                projectRule.fixture.type(char)
                val caretOffset = editor.caretModel.offset
                val actualTypeaheadOriginal = editor.document.charsSequence.subSequence(startOffset, caretOffset).toString()
                val actualTypeahead = actualTypeaheadOriginal.trimStart()
                assertThat(popupManagerSpy.sessionContext.typeaheadOriginal).isEqualTo(actualTypeaheadOriginal)
                assertThat(popupManagerSpy.sessionContext.typeahead).isEqualTo(actualTypeahead)
                assertThat(states.popup.isDisposed).isFalse
            }
            checkRecommendationInfoLabelText(1, expectedNumOfValidRecommendation)

            // Backspacing for the same amount of times
            expectedTypeaheadOriginal.forEach { _ ->
                projectRule.fixture.type('\b')
                val caretOffset = editor.caretModel.offset
                val actualTypeaheadOriginal = editor.document.charsSequence.subSequence(startOffset, caretOffset).toString()
                val actualTypeahead = actualTypeaheadOriginal.trimStart()
                assertThat(popupManagerSpy.sessionContext.typeaheadOriginal).isEqualTo(actualTypeaheadOriginal)
                assertThat(popupManagerSpy.sessionContext.typeahead).isEqualTo(actualTypeahead)
                assertThat(states.popup.isDisposed).isFalse
            }
            checkRecommendationInfoLabelText(expectedSelectedAfterBackspace, 5)
        }
    }

    private fun testTypingTypeaheadMatchingRecommendationShouldMatchRightContext(rightContext: String) {
        projectRule.fixture.configureByText(pythonFileName, pythonTestLeftContext + rightContext)
        runInEdtAndWait {
            projectRule.fixture.editor.caretModel.moveToOffset(pythonTestLeftContext.length)
        }
        withCodeWhispererServiceInvokedAndWait { states ->
            val recommendation = states.recommendationContext.details[0].reformatted.content()
            val editor = projectRule.fixture.editor
            val startOffset = editor.caretModel.offset
            recommendation.forEachIndexed { index, char ->
                if (index < editor.caretModel.offset - startOffset) return@forEachIndexed
                projectRule.fixture.type(char)
                val caretOffset = editor.caretModel.offset
                val typeahead = editor.document.charsSequence.subSequence(startOffset, caretOffset).toString()
                assertThat(popupManagerSpy.sessionContext.typeahead).isEqualTo(typeahead)
            }
        }
    }
}
