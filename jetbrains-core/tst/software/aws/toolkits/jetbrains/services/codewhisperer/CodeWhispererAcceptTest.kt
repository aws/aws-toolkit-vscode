// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.doAnswer
import org.mockito.kotlin.stub
import org.mockito.kotlin.timeout
import org.mockito.kotlin.verify
import software.amazon.awssdk.services.codewhisperer.model.ListRecommendationsRequest
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.javaFileName
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.javaResponse
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.javaTestContext
import software.aws.toolkits.jetbrains.services.codewhisperer.model.InvocationContext

class CodeWhispererAcceptTest : CodeWhispererTestBase() {

    @Before
    override fun setUp() {
        super.setUp()

        // Use java code to test curly braces behavior
        projectRule.fixture.configureByText(javaFileName, javaTestContext)
        mockClient.stub {
            on {
                mockClient.listRecommendations(any<ListRecommendationsRequest>())
            } doAnswer {
                javaResponse
            }
        }
        runInEdtAndWait {
            projectRule.fixture.editor.caretModel.moveToOffset(projectRule.fixture.editor.document.textLength - 2)
        }
    }

    @Test
    fun `test accept recommendation with no typeahead no right context`() {
        testAcceptRecommendationWithTypingAndMatchingRightContext("", "")
    }

    @Test
    fun `test accept recommendation with no typeahead with matching right context`() {
        testAcceptRecommendationWithTypingAndMatchingRightContext("", "(")
        testAcceptRecommendationWithTypingAndMatchingRightContext("", "()")
        testAcceptRecommendationWithTypingAndMatchingRightContext("", "() {")
        testAcceptRecommendationWithTypingAndMatchingRightContext("", "{")
        testAcceptRecommendationWithTypingAndMatchingRightContext("", "(){")
        testAcceptRecommendationWithTypingAndMatchingRightContext("", "() {")
        testAcceptRecommendationWithTypingAndMatchingRightContext("", "() {\n    }")
        testAcceptRecommendationWithTypingAndMatchingRightContext("", "() {\n    }     ")
    }

    @Test
    fun `test accept recommendation with typeahead with matching right context`() {
        val lastIndexOfNewLine = javaResponse.recommendations()[0].content().lastIndexOf("\n")
        val recommendation = javaResponse.recommendations()[0].content().substring(0, lastIndexOfNewLine)
        recommendation.indices.forEach {
            val typeahead = recommendation.substring(0, it + 1)
            testAcceptRecommendationWithTypingAndMatchingRightContext(typeahead, "(")
            testAcceptRecommendationWithTypingAndMatchingRightContext(typeahead, "()")
            testAcceptRecommendationWithTypingAndMatchingRightContext(typeahead, "() {")
            testAcceptRecommendationWithTypingAndMatchingRightContext(typeahead, "{")
            testAcceptRecommendationWithTypingAndMatchingRightContext(typeahead, "(){")
            testAcceptRecommendationWithTypingAndMatchingRightContext(typeahead, "() {")
            testAcceptRecommendationWithTypingAndMatchingRightContext(typeahead, "() {\n    }")
            testAcceptRecommendationWithTypingAndMatchingRightContext(typeahead, "() {\n    }     ")
        }
    }

    private fun testAcceptRecommendationWithTypingAndMatchingRightContext(typing: String, rightContext: String) {
        projectRule.fixture.configureByText(javaFileName, buildContextWithRecommendation(rightContext))
        runInEdtAndWait {
            projectRule.fixture.editor.caretModel.moveToOffset(javaTestContext.length - 2)
        }
        withCodeWhispererServiceInvokedAndWait {
            val statesCaptor = argumentCaptor<InvocationContext>()
            verify(popupManagerSpy, timeout(5000).atLeastOnce()).render(statesCaptor.capture(), any(), any())
            val states = statesCaptor.lastValue
            val recommendation = states.recommendationContext.details[0].reformatted.content()
            val editor = projectRule.fixture.editor
            val expectedContext = buildContextWithRecommendation(recommendation)
            runInEdtAndWait {
                val startOffset = editor.caretModel.offset
                typing.forEachIndexed { index, char ->
                    if (index < editor.caretModel.offset - startOffset) return@forEachIndexed
                    projectRule.fixture.type(char)
                }
                popupManagerSpy.popupComponents.acceptButton.doClick()
            }
            assertThat(projectRule.fixture.editor.document.text).isEqualTo(expectedContext)
        }
    }

    private fun buildContextWithRecommendation(recommendation: String): String {
        val lastIndexOfNewLine = javaTestContext.length - 2
        return javaTestContext.substring(0, lastIndexOfNewLine) + recommendation + javaTestContext.substring(lastIndexOfNewLine)
    }
}
