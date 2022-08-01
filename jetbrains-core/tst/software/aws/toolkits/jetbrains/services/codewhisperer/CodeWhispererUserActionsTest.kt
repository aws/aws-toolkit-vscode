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
import com.intellij.testFramework.runInEdtAndWait
import org.junit.Before
import org.junit.Test
import org.mockito.kotlin.any
import org.mockito.kotlin.timeout
import org.mockito.kotlin.verify
import software.aws.toolkits.jetbrains.services.codewhisperer.CodeWhispererTestUtil.pythonTestLeftContext

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
            runInEdtAndWait {
                verify(popupManagerSpy, timeout(5000)).cancelPopup(any())
            }
        }
    }
}
