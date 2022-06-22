// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.popup.handlers

import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.editor.Caret
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.actionSystem.EditorActionHandler
import software.aws.toolkits.jetbrains.services.codewhisperer.model.InvocationContext
import software.aws.toolkits.jetbrains.services.codewhisperer.popup.CodeWhispererPopupManager

class CodeWhispererPopupBackspaceHandler(
    private val defaultHandler: EditorActionHandler,
    states: InvocationContext
) : CodeWhispererEditorActionHandler(states) {
    override fun doExecute(editor: Editor, caret: Caret?, dataContext: DataContext?) {
        val popupManager = CodeWhispererPopupManager.getInstance()
        popupManager.dontClosePopupAndRun {
            val oldOffset = editor.caretModel.offset
            defaultHandler.execute(editor, caret, dataContext)
            val newOffset = editor.caretModel.offset
            val newText = "a".repeat(oldOffset - newOffset)
            ApplicationManager.getApplication().messageBus.syncPublisher(
                CodeWhispererPopupManager.CODEWHISPERER_USER_ACTION_PERFORMED
            ).backspace(states, newText)
        }
    }
}
