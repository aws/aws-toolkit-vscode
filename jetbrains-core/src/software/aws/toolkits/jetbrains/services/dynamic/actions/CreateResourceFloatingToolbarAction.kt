// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic.actions

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.DumbAwareAction
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResourceVirtualFile
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message

class CreateResourceFloatingToolbarAction : DumbAwareAction() {

    override fun actionPerformed(e: AnActionEvent) {
        val psiFile = e.getData(CommonDataKeys.PSI_FILE)
        val file = e.getData(CommonDataKeys.PSI_FILE)?.virtualFile
        val content = jacksonObjectMapper().readTree(psiFile?.text)
        if (file is DynamicResourceVirtualFile) {
            val resourceIdentifier = file.getResourceIdentifier()
            e.project?.let { project ->
                FileEditorManager.getInstance(project).closeFile(file)
                notifyInfo(
                    message("dynamic_resources.resource_creation", resourceIdentifier.resourceType),
                    message("dynamic_resources.begin_resource_creation", resourceIdentifier.resourceType),
                    project
                )
                // DynamicResourceUpdateManager.create(resourceIdentifier ,jacksonObjectMapper().writeValueAsString(content))
            }
        }
    }

    override fun update(e: AnActionEvent) {
        val file = e.getData(CommonDataKeys.PSI_FILE)?.virtualFile
        e.presentation.isEnabledAndVisible = file is DynamicResourceVirtualFile &&
            file.name == message("dynamic_resources.create_resource_file_name", file.getResourceIdentifier().resourceType)
        e.presentation.icon = AllIcons.Actions.Menu_saveall // TODO: Revisit and review this icon
        if (file is DynamicResourceVirtualFile) {
            e.presentation.text = message("dynamic_resource.create_resource_action", file.getResourceIdentifier().resourceType)
        }
    }
}
