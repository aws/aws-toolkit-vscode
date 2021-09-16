// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic.actions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.fileEditor.FileDocumentManager
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResourceVirtualFile

class MutateResourceModelFloatingToolbarActionGroup : DefaultActionGroup() {
    override fun update(e: AnActionEvent) {
        val editor = e.getData(CommonDataKeys.EDITOR) ?: return
        e.presentation.isVisible = editor.isFileEditor() && e.getData(CommonDataKeys.PSI_FILE)?.virtualFile is DynamicResourceVirtualFile
    }

    private fun Editor.isFileEditor(): Boolean {
        val documentManager = FileDocumentManager.getInstance()
        val virtualFile = documentManager.getFile(document)
        return virtualFile != null && virtualFile.isValid
    }
}
