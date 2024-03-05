// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.federation

import com.intellij.openapi.actionSystem.ActionPlaces
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.editor.ex.util.EditorUtil
import com.intellij.openapi.project.DumbAwareAction

class OpenArnInConsoleEditorPopupAction : DumbAwareAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val editor = e.getData(CommonDataKeys.EDITOR)
        val selection = editor.selection() ?: return
        val project = e.getData(CommonDataKeys.PROJECT) ?: return

        AwsConsoleUrlFactory.openArnInConsole(project, ActionPlaces.EDITOR_POPUP, selection)
    }

    override fun getActionUpdateThread() = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        val editor = e.getData(CommonDataKeys.EDITOR)
        val isAvailable = if (editor == null || !EditorUtil.isRealFileEditor(editor)) {
            false
        } else {
            editor.selection()?.startsWith("arn:", ignoreCase = true) == true
        }

        e.presentation.isEnabledAndVisible = isAvailable
    }

    private fun Editor?.selection() = this?.selectionModel?.selectedText
}
