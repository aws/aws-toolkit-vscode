// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic.explorer.actions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.DumbAware
import software.aws.toolkits.jetbrains.core.credentials.getConnectionSettingsOrThrow
import software.aws.toolkits.jetbrains.core.experiments.isEnabled
import software.aws.toolkits.jetbrains.core.explorer.DeleteResourceDialog
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleExplorerNodeAction
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResourceIdentifier
import software.aws.toolkits.jetbrains.services.dynamic.DynamicResourceUpdateManager
import software.aws.toolkits.jetbrains.services.dynamic.JsonResourceModificationExperiment
import software.aws.toolkits.jetbrains.services.dynamic.ViewEditableDynamicResourceVirtualFile
import software.aws.toolkits.jetbrains.services.dynamic.explorer.DynamicResourceNode
import software.aws.toolkits.resources.message

class DynamicResourceDeleteResourceAction :
    SingleExplorerNodeAction<DynamicResourceNode>(message("dynamic_resources.delete_resource"), icon = AllIcons.Actions.Cancel),
    DumbAware {

    override fun actionPerformed(selected: DynamicResourceNode, e: AnActionEvent) {
        val resourceType = selected.resource.type.fullName
        val response = DeleteResourceDialog(selected.nodeProject, resourceType, selected.displayName()).showAndGet()
        if (response) {
            val dynamicResourceIdentifier = DynamicResourceIdentifier(
                selected.nodeProject.getConnectionSettingsOrThrow(),
                selected.resource.type.fullName,
                selected.resource.identifier
            )
            val fileEditorManager = FileEditorManager.getInstance(selected.nodeProject)
            fileEditorManager.openFiles.forEach {
                if (it is ViewEditableDynamicResourceVirtualFile && it.dynamicResourceIdentifier == dynamicResourceIdentifier) {
                    ApplicationManager.getApplication().invokeAndWait { fileEditorManager.closeFile(it) }
                }
            }
            DynamicResourceUpdateManager.getInstance(selected.nodeProject).deleteResource(dynamicResourceIdentifier)
        }
    }

    override fun update(selected: DynamicResourceNode, e: AnActionEvent) {
        e.presentation.isEnabledAndVisible = JsonResourceModificationExperiment.isEnabled()
    }
}
