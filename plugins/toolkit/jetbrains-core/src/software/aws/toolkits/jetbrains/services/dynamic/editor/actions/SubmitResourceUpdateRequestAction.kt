// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic.editor.actions

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.flipkart.zjsonpatch.JsonDiff
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.ui.Messages.showYesNoDialog
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResourceUpdateManager
import software.aws.toolkits.jetbrains.services.dynamic.ViewEditableDynamicResourceVirtualFile
import software.aws.toolkits.resources.message

class SubmitResourceUpdateRequestAction : AnAction(message("dynamic_resources.editor.submitResourceUpdateRequest_text")) {
    override fun actionPerformed(e: AnActionEvent) {
        val psiFile = e.getData(CommonDataKeys.PSI_FILE)
        val file = psiFile?.virtualFile as? ViewEditableDynamicResourceVirtualFile ?: return

        val content = psiFile.text
        val patchOperations = JsonDiff.asJson(mapper.readTree(file.inputStream), mapper.readTree(content))
        if (patchOperations.isEmpty) {
            if (showYesNoDialog(
                    psiFile.project,
                    message("dynamic_resources.update_resource_no_changes_made"),
                    message("dynamic_resources.update_resource_no_changes_made_title"),
                    Messages.getWarningIcon()
                ) == Messages.NO
            ) {
                file.isWritable = false
            }
        } else {
            file.isWritable = false
            DynamicResourceUpdateManager.getInstance(psiFile.project).updateResource(file.dynamicResourceIdentifier, patchOperations.toPrettyString())
        }
    }

    companion object {
        val mapper = jacksonObjectMapper()
    }
}
