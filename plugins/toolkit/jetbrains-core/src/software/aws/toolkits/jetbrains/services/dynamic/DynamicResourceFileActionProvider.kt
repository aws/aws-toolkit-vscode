// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic

import com.intellij.ide.browsers.BrowserLauncher
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Key
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.EditorNotificationPanel
import com.intellij.ui.EditorNotifications
import com.jetbrains.jsonSchema.ide.JsonSchemaService
import software.aws.toolkits.jetbrains.core.experiments.isEnabled
import software.aws.toolkits.resources.message

class DynamicResourceFileActionProvider :
    EditorNotifications.Provider<DynamicResourceFileActionProvider.DynamicResourceVirtualFilePanel>() {
    override fun getKey(): Key<DynamicResourceVirtualFilePanel> = KEY

    override fun createNotificationPanel(file: VirtualFile, fileEditor: FileEditor, project: Project):
        DynamicResourceVirtualFilePanel? {
        if (!JsonResourceModificationExperiment.isEnabled()) return null
        return when (file) {
            is CreateDynamicResourceVirtualFile ->
                DynamicResourceVirtualFilePanel(
                    project,
                    file,
                    message("dynamic_resources.create_resource_instruction"),
                    "dynamic.resource.editor.submitResourceCreationRequest"
                ).also { DynamicResourceSchemaMapping.getInstance().addResourceSchemaMapping(project, file) }
            is ViewEditableDynamicResourceVirtualFile ->
                when (file.isWritable) {
                    true -> DynamicResourceVirtualFilePanel(
                        project,
                        file,
                        message("dynamic_resources.update_resource_instruction"),
                        "dynamic.resource.editor.submitResourceUpdateRequest"
                    ).also { DynamicResourceSchemaMapping.getInstance().addResourceSchemaMapping(project, file) }
                    false -> DynamicResourceVirtualFilePanel(
                        project,
                        file,
                        message("dynamic_resources.edit_resource_instruction"),
                        "dynamic.resource.editor.enableEditingResource"
                    ).also { JsonSchemaService.Impl.get(project).reset() }
                }
            else -> null
        }
    }

    class DynamicResourceVirtualFilePanel(project: Project, file: DynamicResourceVirtualFile, text: String, actionId: String) : EditorNotificationPanel() {
        init {
            text(text)
            DynamicResourceSupportedTypes.getInstance().getDocs(file.dynamicResourceType)?.let { docUrl ->
                createActionLabel(message("dynamic_resources.type.explorer.view_documentation")) {
                    BrowserLauncher.instance.browse(docUrl, project = project)
                }
            }

            val action = ActionManager.getInstance().getAction(actionId)
            action.templateText?.let {
                createActionLabel(it) {
                    executeAction(actionId)
                    EditorNotifications.getInstance(project).updateNotifications(file)
                }
            }
        }
    }

    companion object {
        val KEY = Key.create<DynamicResourceVirtualFilePanel>("software.aws.toolkits.jetbrains.core.dynamic.resource.file.actions")
    }
}
