// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic.actions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResourceFileActionProvider

class EditResourceAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val psiFile = e.getData(CommonDataKeys.PSI_FILE) ?: throw Exception("file not found")
        val file = psiFile.virtualFile
        file?.isWritable = true
        DynamicResourceFileActionProvider.updatePanel(file, psiFile.project)
    }
}
