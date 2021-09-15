// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic.actions

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.ui.Messages
import software.aws.toolkits.jetbrains.services.dynamic.CreateDynamicResourceVirtualFile
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResourceUpdateManager
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResourceVirtualFile
import software.aws.toolkits.jetbrains.services.dynamic.InitialCreateDynamicResourceContent
import software.aws.toolkits.jetbrains.services.dynamic.ViewEditableDynamicResourceVirtualFile
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message

class BeginCreateResourceAction : AnAction() {

    override fun actionPerformed(e: AnActionEvent) {
        val psiFile = e.getData(CommonDataKeys.PSI_FILE)
        val file = psiFile?.virtualFile as? CreateDynamicResourceVirtualFile ?: return
        val resourceType = file.dynamicResourceType

        val contentString = removePrettyPrinting(psiFile.text)
        val continueWithContent = if (contentString == InitialCreateDynamicResourceContent.initialContent) {
            // TODO: Custom warning with documentation links
            Messages.showYesNoDialog(
                psiFile.project,
                message("dynamic_resources.create_resource_file_empty"),
                message("dynamic_resources.create_resource_file_empty_title"),
                Messages.getWarningIcon()
            ) == Messages.YES
        } else true
        if (continueWithContent) {
            FileEditorManager.getInstance(psiFile.project).closeFile(file)
            // TODO: Keep file open so that user can make changes in case creation fails
            notifyInfo(
                message("dynamic_resources.resource_creation", resourceType),
                message("dynamic_resources.begin_resource_creation", resourceType),
                psiFile.project
            )
            DynamicResourceUpdateManager.getInstance(psiFile.project).createResource(file.connectionSettings, file.dynamicResourceType, contentString)
        }
    }

    override fun update(e: AnActionEvent) {
        val file = e.getData(CommonDataKeys.PSI_FILE)?.virtualFile as? DynamicResourceVirtualFile ?: return
        e.presentation.isEnabledAndVisible = file is CreateDynamicResourceVirtualFile && file !is ViewEditableDynamicResourceVirtualFile
        e.presentation.icon = AllIcons.Actions.Menu_saveall // TODO: Revisit and review this icon
        e.presentation.text = message("dynamic_resources.create_resource_action", file.dynamicResourceType)
    }

    private fun removePrettyPrinting(content: String) = mapper.writeValueAsString(mapper.readTree(content))

    companion object {
        private val mapper = jacksonObjectMapper()
    }
}
