// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer

import com.intellij.openapi.actionSystem.IdeActions.ACTION_EDITOR_DELETE_LINE
import com.intellij.openapi.actionSystem.IdeActions.ACTION_EDITOR_DELETE_TO_WORD_START
import com.intellij.openapi.actionSystem.IdeActions.ACTION_EDITOR_MOVE_CARET_LEFT_WITH_SELECTION
import com.intellij.openapi.actionSystem.IdeActions.ACTION_EDITOR_MOVE_CARET_RIGHT_WITH_SELECTION
import com.intellij.openapi.actionSystem.IdeActions.ACTION_EDITOR_MOVE_LINE_END_WITH_SELECTION
import com.intellij.openapi.actionSystem.IdeActions.ACTION_EDITOR_MOVE_LINE_START_WITH_SELECTION
import com.intellij.openapi.actionSystem.IdeActions.ACTION_EDITOR_SELECT_WORD_AT_CARET
import com.intellij.openapi.actionSystem.IdeActions.ACTION_EDITOR_TEXT_END_WITH_SELECTION
import com.intellij.openapi.actionSystem.IdeActions.ACTION_EDITOR_TEXT_START_WITH_SELECTION
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.ui.popup.JBPopup
import com.intellij.testFramework.runInEdtAndWait
import org.assertj.core.api.Assertions.assertThat
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.timeout
import org.mockito.kotlin.verify
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.javaFileName
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.pythonFileName
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.pythonTestLeftContext
import software.aws.toolkits.jetbrains.services.codewhisperer.explorer.CodeWhispererExplorerActionManager

class CodeWhispererUserActionsTest : CodeWhispererTestBase() {

    @Before
    override fun setUp() {
        super.setUp()
        WriteCommandAction.runWriteCommandAction(projectRule.project) {
            projectRule.fixture.editor.document.insertString(projectRule.fixture.editor.caretModel.offset, "test")
        }
    }
    @Test
    fun `test delete to word start should cancel popup`() {
        testUserActionsShouldCancelPopup(ACTION_EDITOR_DELETE_TO_WORD_START)
    }

    @Test
    fun `test delete line should cancel popup`() {
        testUserActionsShouldCancelPopup(ACTION_EDITOR_DELETE_LINE)
    }

    @Test
    fun `test text start with selection should cancel popup`() {
        testUserActionsShouldCancelPopup(ACTION_EDITOR_TEXT_START_WITH_SELECTION)
    }

    @Test
    fun `test text end with selection should cancel popup`() {
        testUserActionsShouldCancelPopup(ACTION_EDITOR_TEXT_END_WITH_SELECTION)
    }

    @Test
    fun `test move line start with selection should cancel popup`() {
        testUserActionsShouldCancelPopup(ACTION_EDITOR_MOVE_LINE_START_WITH_SELECTION)
    }

    @Test
    fun `test move line end selection should cancel popup`() {
        testUserActionsShouldCancelPopup(ACTION_EDITOR_MOVE_LINE_END_WITH_SELECTION)
    }

    @Test
    fun `test select word at caret should cancel popup`() {
        testUserActionsShouldCancelPopup(ACTION_EDITOR_SELECT_WORD_AT_CARET)
    }

    @Test
    fun `test move caret left with selection should cancel popup`() {
        testUserActionsShouldCancelPopup(ACTION_EDITOR_MOVE_CARET_LEFT_WITH_SELECTION)
    }

    @Test
    fun `test move caret right with selection should cancel popup`() {
        testUserActionsShouldCancelPopup(ACTION_EDITOR_MOVE_CARET_RIGHT_WITH_SELECTION)
    }

    private fun testUserActionsShouldCancelPopup(actionId: String) {
        runInEdtAndWait {
            projectRule.fixture.editor.caretModel.moveToOffset(pythonTestLeftContext.length)
        }
        withCodeWhispererServiceInvokedAndWait {
            projectRule.fixture.performEditorAction(actionId)
            verify(popupManagerSpy, timeout(5000)).cancelPopup(any())
        }
    }

    @Test
    fun `test hitting enter after non-whitespace characters should trigger CodeWhisperer`() {
        testHittingEnterAfterWhitespaceCharsShouldTriggerCodeWhisperer(pythonTestLeftContext, 1)
    }

    @Test
    fun `test hitting enter after whitespace characters should trigger CodeWhisperer`() {
        testHittingEnterAfterWhitespaceCharsShouldTriggerCodeWhisperer("$pythonTestLeftContext ", 1)
        testHittingEnterAfterWhitespaceCharsShouldTriggerCodeWhisperer("$pythonTestLeftContext\t", 2)
        testHittingEnterAfterWhitespaceCharsShouldTriggerCodeWhisperer("$pythonTestLeftContext\n", 3)
    }

    @Test
    fun `test hitting enter inside braces in Java file should auto-trigger CodeWhisperer and keep the formatting correct`() {
        val testLeftContext = "public class Test {\n    public static void main() {"
        val testRightContext = "}\n}"
        setFileContext(javaFileName, testLeftContext, testRightContext)
        CodeWhispererExplorerActionManager.getInstance().setAutoEnabled(true)
        projectRule.fixture.type('\n')
        val expectedFileContext = "$testLeftContext\n        \n    $testRightContext"
        assertThat(projectRule.fixture.editor.document.text).isEqualTo(expectedFileContext)
        val popupCaptor = argumentCaptor<JBPopup>()
        verify(popupManagerSpy, timeout(5000))
            .showPopup(any(), any(), popupCaptor.capture(), any(), any())
        runInEdtAndWait {
            popupManagerSpy.closePopup(popupCaptor.lastValue)
        }
    }

    private fun testHittingEnterAfterWhitespaceCharsShouldTriggerCodeWhisperer(prompt: String, times: Int) {
        CodeWhispererExplorerActionManager.getInstance().setAutoEnabled(true)
        setFileContext(pythonFileName, prompt, "")
        projectRule.fixture.type('\n')
        val popupCaptor = argumentCaptor<JBPopup>()
        verify(popupManagerSpy, timeout(5000).atLeast(times))
            .showPopup(any(), any(), popupCaptor.capture(), any(), any())
        runInEdtAndWait {
            popupManagerSpy.closePopup(popupCaptor.lastValue)
        }
    }
}
