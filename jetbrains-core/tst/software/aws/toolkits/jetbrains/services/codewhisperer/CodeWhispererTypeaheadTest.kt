// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.openapi.application.runInEdt
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.timeout
import org.mockito.kotlin.verify
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.pythonFileName
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.pythonTestLeftContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.InvocationContext

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
        testTypingTypeaheadWithLeadingSpaceShouldMatchTypeaheadStateCorrectly(testTypeaheadOriginal, 5)
    }

    @Test
    fun `test typing typeahead with leading spaces and matching suffix should correctly update typeahead state`() {
        val testTypeaheadOriginal = "   test"
        testTypingTypeaheadWithLeadingSpaceShouldMatchTypeaheadStateCorrectly(testTypeaheadOriginal, 3)
    }

    private fun testTypingTypeaheadWithLeadingSpaceShouldMatchTypeaheadStateCorrectly(
        expectedTypeaheadOriginal: String,
        expectedNumOfValidRecommendation: Int
    ) {
        val expectedTypeahead = expectedTypeaheadOriginal.trimStart()
        withCodeWhispererServiceInvokedAndWait {
            val statesCaptor = argumentCaptor<InvocationContext>()
            verify(popupManagerSpy, timeout(5000)).render(statesCaptor.capture(), any(), any())
            val states = statesCaptor.lastValue
            val editor = projectRule.fixture.editor
            runInEdt {
                val startOffset = editor.caretModel.offset
                expectedTypeaheadOriginal.forEach { char ->
                    projectRule.fixture.type(char)
                    val caretOffset = editor.caretModel.offset
                    val actualTypeaheadOriginal = editor.document.charsSequence.subSequence(startOffset, caretOffset).toString()
                    assertThat(popupManagerSpy.sessionContext.typeaheadOriginal).isEqualTo(expectedTypeaheadOriginal)
                    assertThat(popupManagerSpy.sessionContext.typeahead).isEqualTo(expectedTypeahead)
                    assertThat(actualTypeaheadOriginal).isEqualTo(expectedTypeaheadOriginal)
                    assertThat(states.popup.isDisposed).isFalse
                }
                checkRecommendationInfoLabelText(1, expectedNumOfValidRecommendation)

                // Backspacing for the same amount of times
                expectedTypeaheadOriginal.forEach { _ ->
                    projectRule.fixture.type('\b')
                    val caretOffset = editor.caretModel.offset
                    val actualTypeaheadOriginal = editor.document.charsSequence.subSequence(startOffset, caretOffset).toString()
                    assertThat(popupManagerSpy.sessionContext.typeaheadOriginal).isEqualTo(expectedTypeaheadOriginal)
                    assertThat(popupManagerSpy.sessionContext.typeahead).isEqualTo(expectedTypeahead)
                    assertThat(actualTypeaheadOriginal).isEqualTo(expectedTypeaheadOriginal)
                    assertThat(states.popup.isDisposed).isFalse
                }
                checkRecommendationInfoLabelText(1, 5)
            }
        }
    }

    private fun testTypingTypeaheadMatchingRecommendationShouldMatchRightContext(rightContext: String) {
        projectRule.fixture.configureByText(pythonFileName, pythonTestLeftContext + rightContext)
        runInEdtAndWait {
            projectRule.fixture.editor.caretModel.moveToOffset(pythonTestLeftContext.length)
        }
        withCodeWhispererServiceInvokedAndWait {
            val statesCaptor = argumentCaptor<InvocationContext>()
            verify(popupManagerSpy, timeout(5000)).render(statesCaptor.capture(), any(), any())
            val states = statesCaptor.firstValue
            val recommendation = states.recommendationContext.details[0].reformatted.content()
            val editor = projectRule.fixture.editor
            runInEdtAndWait {
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
}
