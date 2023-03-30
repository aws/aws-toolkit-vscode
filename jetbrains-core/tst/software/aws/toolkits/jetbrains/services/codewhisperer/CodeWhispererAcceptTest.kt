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
import org.mockito.kotlin.times
import software.amazon.awssdk.services.codewhisperer.model.ListRecommendationsRequest
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.javaFileName
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.javaResponse
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.javaTestContext
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
    fun `test accept recommendation with no typeahead no right context using keyboard`() {
        testAcceptRecommendationWithTypingAndMatchingRightContext("", "", true)
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

    @Test
    fun `test CodeWhisperer keyboard shortcuts should be prioritized to be executed`() {
        testCodeWhispererKeyboardShortcutShouldBePrioritized(ACTION_EDITOR_TAB)
        testCodeWhispererKeyboardShortcutShouldBePrioritized(ACTION_EDITOR_MOVE_CARET_RIGHT)
        testCodeWhispererKeyboardShortcutShouldBePrioritized(ACTION_EDITOR_MOVE_CARET_LEFT)
    }

    private fun testCodeWhispererKeyboardShortcutShouldBePrioritized(actionId: String) {
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

    private fun testAcceptRecommendationWithTypingAndMatchingRightContext(typing: String, rightContext: String, useKeyboard: Boolean = false) {
        projectRule.fixture.configureByText(javaFileName, buildContextWithRecommendation(rightContext))
        runInEdtAndWait {
            projectRule.fixture.editor.caretModel.moveToOffset(javaTestContext.length - 2)
        }
        withCodeWhispererServiceInvokedAndWait { states ->
            val recommendation = states.recommendationContext.details[0].reformatted.content()
            val editor = projectRule.fixture.editor
            val expectedContext = buildContextWithRecommendation(recommendation)
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
