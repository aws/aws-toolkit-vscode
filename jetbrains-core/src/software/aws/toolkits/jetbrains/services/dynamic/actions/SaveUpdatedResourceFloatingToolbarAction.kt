// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic.actions

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.flipkart.zjsonpatch.JsonDiff
import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.project.DumbAwareAction
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResourceVirtualFile

class SaveUpdatedResourceFloatingToolbarAction : DumbAwareAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val psiFile = e.getData(CommonDataKeys.PSI_FILE)
        val file = psiFile?.virtualFile
        file?.isWritable = false
        val content = psiFile?.text
        val res = JsonDiff.asJson(jacksonObjectMapper().readTree(file?.inputStream), jacksonObjectMapper().readTree(content))
        println(res)
    }

    override fun update(e: AnActionEvent) {
        val file = e.getData(CommonDataKeys.PSI_FILE)?.virtualFile
        e.presentation.isEnabledAndVisible = file is DynamicResourceVirtualFile && file.isWritable
        e.presentation.icon = AllIcons.Actions.Menu_saveall
        if (file is DynamicResourceVirtualFile) {
            e.presentation.text = "Update ${file.getResourceIdentifier().resourceIdentifier}"
        }
    }
}
