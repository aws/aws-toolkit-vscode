// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic.actions

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.flipkart.zjsonpatch.JsonDiff
import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import software.aws.toolkits.jetbrains.services.dynamic.CreateDynamicResourceVirtualFile
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResourceUpdateManager
import software.aws.toolkits.jetbrains.services.dynamic.ViewEditableDynamicResourceVirtualFile
import software.aws.toolkits.resources.message

class SaveUpdatedResourceAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val psiFile = e.getData(CommonDataKeys.PSI_FILE)
        val file = psiFile?.virtualFile as? ViewEditableDynamicResourceVirtualFile ?: return
        file.isWritable = false
        val content = psiFile.text
        val res = JsonDiff.asJson(mapper.readTree(file.inputStream), mapper.readTree(content))
        DynamicResourceUpdateManager.getInstance(psiFile.project).updateResource(file.dynamicResourceIdentifier, res.toPrettyString())
    }

    override fun update(e: AnActionEvent) {
        val file = e.getData(CommonDataKeys.PSI_FILE)?.virtualFile
        e.presentation.isEnabledAndVisible = file is ViewEditableDynamicResourceVirtualFile && file.isWritable && file !is CreateDynamicResourceVirtualFile
        e.presentation.icon = AllIcons.Actions.Menu_saveall
        val virtualFile = file as? ViewEditableDynamicResourceVirtualFile ?: return
        e.presentation.text = message("dynamic_resources.update_resource", virtualFile.dynamicResourceIdentifier.resourceIdentifier)
    }

    companion object {
        val mapper = jacksonObjectMapper()
    }
}
