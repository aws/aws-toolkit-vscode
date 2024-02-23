// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic.editor.actions

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.ui.Messages
import software.aws.toolkits.jetbrains.services.dynamic.CreateDynamicResourceVirtualFile
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResourceUpdateManager
import software.aws.toolkits.jetbrains.services.dynamic.InitialCreateDynamicResourceContent
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message

class SubmitResourceCreationRequestAction : AnAction(message("general.create")) {

    override fun actionPerformed(e: AnActionEvent) {
        val psiFile = e.getData(CommonDataKeys.PSI_FILE)
        val file = psiFile?.virtualFile as? CreateDynamicResourceVirtualFile ?: return
        val resourceType = file.dynamicResourceType

        val contentString = psiFile.text
        val continueWithContent = if (contentString == InitialCreateDynamicResourceContent.initialContent) {
            Messages.showYesNoDialog(
                psiFile.project,
                message("dynamic_resources.create_resource_file_empty"),
                message("dynamic_resources.create_resource_file_empty_title"),
                Messages.getWarningIcon()
            ) == Messages.YES
        } else {
            true
        }
        if (continueWithContent) {
            notifyInfo(
                message("dynamic_resources.resource_creation", resourceType),
                message("dynamic_resources.begin_resource_creation", resourceType),
                psiFile.project
            )
            DynamicResourceUpdateManager.getInstance(psiFile.project).createResource(file.connectionSettings, file.dynamicResourceType, contentString, file)
        }
    }
}
