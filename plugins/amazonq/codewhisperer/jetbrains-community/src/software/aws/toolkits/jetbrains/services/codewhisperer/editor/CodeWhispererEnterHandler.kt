// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.editor

import com.intellij.codeInsight.editorActions.EnterHandler
import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.editor.Caret
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.actionSystem.EditorActionHandler
import software.aws.toolkits.jetbrains.services.codewhisperer.editor.CodeWhispererEditorUtil.shouldSkipInvokingBasedOnRightContext
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererAutoTriggerService
import software.aws.toolkits.jetbrains.services.codewhisperer.service.CodeWhispererAutomatedTriggerType

class CodeWhispererEnterHandler(private val originalHandler: EditorActionHandler) : EnterHandler(originalHandler) {
    override fun executeWriteAction(editor: Editor, caret: Caret?, dataContext: DataContext?) {
        originalHandler.execute(editor, caret, dataContext)

        if (shouldSkipInvokingBasedOnRightContext(editor)) {
            return
        }

        ApplicationManager.getApplication().executeOnPooledThread {
            CodeWhispererAutoTriggerService.getInstance().tryInvokeAutoTrigger(editor, CodeWhispererAutomatedTriggerType.Enter())
        }
    }
}
