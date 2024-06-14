// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.ide.DataManager
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.actionSystem.IdeActions
import com.intellij.openapi.actionSystem.IdeActions.ACTION_EDITOR_MOVE_CARET_LEFT
import com.intellij.openapi.actionSystem.IdeActions.ACTION_EDITOR_MOVE_CARET_RIGHT
import com.intellij.openapi.actionSystem.IdeActions.ACTION_EDITOR_TAB
import com.intellij.openapi.editor.actionSystem.EditorActionManager
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.doAnswer
import org.mockito.kotlin.stub
import software.amazon.awssdk.services.codewhispererruntime.model.GenerateCompletionsRequest
import software.amazon.awssdk.services.codewhispererruntime.model.GenerateCompletionsResponse
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.generateMockCompletionDetail
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.javaFileName
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.javaResponse
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.javaTestContext
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.metadata
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.sdkHttpResponse
import software.aws.toolkits.jetbrains.services.codewhisperer.actions.CodeWhispererActionPromoter
import kotlin.test.fail

class CodeWhispererAcceptTest : CodeWhispererTestBase() {

    @Before
    override fun setUp() {
        super.setUp()

        // Use java code to test curly braces behavior
        projectRule.fixture.configureByText(javaFileName, javaTestContext)
        mockClient.stub {
            on {
                mockClient.generateCompletions(any<GenerateCompletionsRequest>())
            } doAnswer {
                javaResponse
            }
        }
        runInEdtAndWait {
            projectRule.fixture.editor.caretModel.moveToOffset(projectRule.fixture.editor.document.textLength - 2)
        }
    }

    @Test
    fun `test accept recommendation with no typeahead no matching brackets on the right`() {
        testAcceptRecommendationWithTypingAndMatchingBracketsOnTheRight("", "")
    }

    @Test
    fun `test accept recommendation with no typeahead no matching brackets on the right using keyboard`() {
        testAcceptRecommendationWithTypingAndMatchingBracketsOnTheRight("", "", useKeyboard = true)
    }

    @Test
    fun `test accept recommendation with no typeahead with matching brackets on the right`() {
        testAcceptRecommendationWithTypingAndMatchingBracketsOnTheRight("", "(")
        testAcceptRecommendationWithTypingAndMatchingBracketsOnTheRight("", "()")
        testAcceptRecommendationWithTypingAndMatchingBracketsOnTheRight("", "() {")
        testAcceptRecommendationWithTypingAndMatchingBracketsOnTheRight("", "{")
        testAcceptRecommendationWithTypingAndMatchingBracketsOnTheRight("", "(){")
        testAcceptRecommendationWithTypingAndMatchingBracketsOnTheRight("", "() {")
        testAcceptRecommendationWithTypingAndMatchingBracketsOnTheRight("", "() {\n    }")
        testAcceptRecommendationWithTypingAndMatchingBracketsOnTheRight("", "() {\n    }     ")
    }

    @Test
    fun `test accept recommendation with typeahead with matching brackets on the right`() {
        val lastIndexOfNewLine = javaResponse.completions()[0].content().lastIndexOf("\n")
        val recommendation = javaResponse.completions()[0].content().substring(0, lastIndexOfNewLine)
        recommendation.indices.forEach {
            val typeahead = recommendation.substring(0, it + 1)
            testAcceptRecommendationWithTypingAndMatchingBracketsOnTheRight(typeahead, "(")
            testAcceptRecommendationWithTypingAndMatchingBracketsOnTheRight(typeahead, "()")
            testAcceptRecommendationWithTypingAndMatchingBracketsOnTheRight(typeahead, "() {")
            testAcceptRecommendationWithTypingAndMatchingBracketsOnTheRight(typeahead, "{")
            testAcceptRecommendationWithTypingAndMatchingBracketsOnTheRight(typeahead, "(){")
            testAcceptRecommendationWithTypingAndMatchingBracketsOnTheRight(typeahead, "() {")
            testAcceptRecommendationWithTypingAndMatchingBracketsOnTheRight(typeahead, "() {\n    }")
            testAcceptRecommendationWithTypingAndMatchingBracketsOnTheRight(typeahead, "() {\n    }     ")
        }
    }

    @Test
    fun `test accept single-line recommendation with no typeahead with partial matching brackets on the right`() {
        mockClient.stub {
            on {
                mockClient.generateCompletions(any<GenerateCompletionsRequest>())
            } doAnswer {
                GenerateCompletionsResponse.builder()
                    .completions(
                        generateMockCompletionDetail("(x, y) {"),
                    )
                    .nextToken("")
                    .responseMetadata(metadata)
                    .sdkHttpResponse(sdkHttpResponse)
                    .build() as GenerateCompletionsResponse
            }
        }

        // any non-matching first-line right context should remain
        testAcceptRecommendationWithTypingAndMatchingBracketsOnTheRight("", "(", "test")
        testAcceptRecommendationWithTypingAndMatchingBracketsOnTheRight("", "()", "test")
        testAcceptRecommendationWithTypingAndMatchingBracketsOnTheRight("", "() {", "test")
        testAcceptRecommendationWithTypingAndMatchingBracketsOnTheRight("", "({", "test")
    }

    @Test
    fun `test accept multi-line recommendation with no typeahead with partial matching brackets on the right`() {
        // any first-line right context should be overwritten
        testAcceptRecommendationWithTypingAndMatchingBracketsOnTheRight("", "(test")
        testAcceptRecommendationWithTypingAndMatchingBracketsOnTheRight("", "()test")
        testAcceptRecommendationWithTypingAndMatchingBracketsOnTheRight("", "() {test")
        testAcceptRecommendationWithTypingAndMatchingBracketsOnTheRight("", "({test")
    }

    @Test
    fun `test CodeWhisperer keyboard shortcuts should be prioritized to be executed`() {
        testCodeWhispererKeyboardShortcutShouldBePrioritized(ACTION_EDITOR_TAB)
        testCodeWhispererKeyboardShortcutShouldBePrioritized(ACTION_EDITOR_MOVE_CARET_RIGHT)
        testCodeWhispererKeyboardShortcutShouldBePrioritized(ACTION_EDITOR_MOVE_CARET_LEFT)
    }

    private fun testCodeWhispererKeyboardShortcutShouldBePrioritized(actionId: String) {
        projectRule.fixture.configureByText(javaFileName, javaTestContext)
        val wrongAction = object : AnAction() {
            override fun actionPerformed(e: AnActionEvent) {
                fail("the other action should not get executed first")
            }
        }
        withCodeWhispererServiceInvokedAndWait {
            val codeWhispererAction = ActionManager.getInstance().getAction(actionId)
            val actions = listOf<AnAction>(wrongAction, codeWhispererAction)
            val newActions = CodeWhispererActionPromoter().promote(
                actions.toMutableList(),
                DataManager.getInstance().getDataContext(projectRule.fixture.editor.contentComponent)
            )
            assertThat(newActions[0]).isEqualTo(codeWhispererAction)
            popupManagerSpy.popupComponents.acceptButton.doClick()
        }
    }

    private fun testAcceptRecommendationWithTypingAndMatchingBracketsOnTheRight(
        typing: String,
        brackets: String,
        remaining: String = "",
        useKeyboard: Boolean = false
    ) {
        projectRule.fixture.configureByText(javaFileName, buildContextWithRecommendation(brackets + remaining))
        runInEdtAndWait {
            // move the cursor to the correct trigger point (...void main<trigger>)
            projectRule.fixture.editor.caretModel.moveToOffset(47)
        }
        withCodeWhispererServiceInvokedAndWait { states ->
            val recommendation = states.recommendationContext.details[0].reformatted.content()
            val editor = projectRule.fixture.editor
            val expectedContext = buildContextWithRecommendation(recommendation + remaining)
            val startOffset = editor.caretModel.offset
            typing.forEachIndexed { index, char ->
                if (index < editor.caretModel.offset - startOffset) return@forEachIndexed
                projectRule.fixture.type(char)
            }
            acceptHelper(useKeyboard)
            assertThat(editor.document.text).isEqualTo(expectedContext)
        }
    }

    private fun acceptHelper(useKeyboard: Boolean) {
        if (useKeyboard) {
            EditorActionManager.getInstance().getActionHandler(IdeActions.ACTION_EDITOR_TAB)
                .execute(projectRule.fixture.editor, null, DataContext.EMPTY_CONTEXT)
        } else {
            popupManagerSpy.popupComponents.acceptButton.doClick()
        }
    }

    private fun buildContextWithRecommendation(recommendation: String): String {
        val lastIndexOfNewLine = javaTestContext.length - 2
        return javaTestContext.substring(0, lastIndexOfNewLine) + recommendation + javaTestContext.substring(lastIndexOfNewLine)
    }
}
