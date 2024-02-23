// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic.editor.actions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import software.aws.toolkits.resources.message

class EnableEditingResourceAction : AnAction(message("dynamic_resources.editor.enableEditingResource_text")) {
    override fun actionPerformed(e: AnActionEvent) {
        val psiFile = e.getData(CommonDataKeys.PSI_FILE) ?: throw Exception("file not found")
        val file = psiFile.virtualFile
        file?.isWritable = true
    }
}
