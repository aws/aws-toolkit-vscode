// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic.actions

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.ui.Messages
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResourceUpdateManager
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResourceVirtualFile
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message

class CreateResourceFloatingToolbarAction : DumbAwareAction() {

    override fun actionPerformed(e: AnActionEvent) {
        val psiFile = e.getData(CommonDataKeys.PSI_FILE)
        val file = psiFile?.virtualFile as? DynamicResourceVirtualFile ?: return
        val content = jacksonObjectMapper().readTree(psiFile?.text)
        val resourceIdentifier = file.dynamicResourceIdentifier
        e.project?.let { project ->
            val contentString = jacksonObjectMapper().writeValueAsString(content)
            if (contentString == message("dynamic_resources.create_resource_file_initial_content")) {
                // TODO: Custom warning with documentation links
                Messages.showWarningDialog(
                    project,
                    message("dynamic_resources.create_resource_file_empty"),
                    message("dynamic_resources.create_resource_file_empty_title")
                )
            } else {
                FileEditorManager.getInstance(project).closeFile(file)
                notifyInfo(
                    message("dynamic_resources.resource_creation", resourceIdentifier.resourceType),
                    message("dynamic_resources.begin_resource_creation", resourceIdentifier.resourceType),
                    project
                )
                DynamicResourceUpdateManager.getInstance(project).createResource(resourceIdentifier, jacksonObjectMapper().writeValueAsString(content))
            }
        }
    }

    override fun update(e: AnActionEvent) {
        val file = e.getData(CommonDataKeys.PSI_FILE)?.virtualFile as? DynamicResourceVirtualFile ?: return
        e.presentation.isEnabledAndVisible = file.isResourceCreate
        e.presentation.icon = AllIcons.Actions.Menu_saveall // TODO: Revisit and review this icon
        e.presentation.text = message("dynamic_resources.create_resource_action", file.dynamicResourceIdentifier.resourceType)
    }
}
