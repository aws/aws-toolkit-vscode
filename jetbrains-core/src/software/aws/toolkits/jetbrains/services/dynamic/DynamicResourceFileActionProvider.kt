// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic

import com.intellij.ide.browsers.BrowserLauncher
import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Key
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.EditorNotificationPanel
import com.intellij.ui.EditorNotifications
import software.aws.toolkits.resources.message

class DynamicResourceFileActionProvider :
    EditorNotifications.Provider<DynamicResourceFileActionProvider.DynamicResourceVirtualFilePanel>() {
    override fun getKey(): Key<DynamicResourceVirtualFilePanel> = KEY

    override fun createNotificationPanel(file: VirtualFile, fileEditor: FileEditor, project: Project):
        DynamicResourceVirtualFilePanel? = when (file) {
        is CreateDynamicResourceVirtualFile -> CreateDynamicResourceVirtualFilePanel(file, project)
        is ViewEditableDynamicResourceVirtualFile -> ViewEditableDynamicResourceVirtualFilePanel(file, project)
        else -> null
    }

    abstract class DynamicResourceVirtualFilePanel : EditorNotificationPanel()

    class CreateDynamicResourceVirtualFilePanel(virtualFile: VirtualFile, project: Project) :
        DynamicResourceVirtualFilePanel() {
        init {
            val file = virtualFile as CreateDynamicResourceVirtualFile
            createActionLabel(message("dynamic_resources.resource_documentation")) {
                BrowserLauncher.instance.browse(DynamicResourceSupportedTypes.getInstance().getDocs(file.dynamicResourceType), project = project)
            }

            createActionLabel(message("dynamic_resources.create").capitalize(), "dynamic.resource.create.resource.action")
            text(message("dynamic_resources.create_resource_instruction"))
        }
    }

    class ViewEditableDynamicResourceVirtualFilePanel(file: VirtualFile, project: Project) :
        DynamicResourceVirtualFilePanel() {
        init {
            val f = file as ViewEditableDynamicResourceVirtualFile
            createActionLabel(message("dynamic_resources.resource_documentation")) {
                BrowserLauncher.instance.browse(DynamicResourceSupportedTypes.getInstance().getDocs(f.dynamicResourceType), project = project)
            }
            if (!file.isWritable) {
                createActionLabel(message("dynamic_resources.edit_resource"), "dynamic.resource.update.resource.action")
                text(message("dynamic_resources.edit_resource_instruction"))
                update(file, project)
            } else {
                createActionLabel(message("dynamic_resources.update_resource"), "dynamic.resource.save.updated.resource.action")
                text(message("dynamic_resources.update_resource_instruction"))
                update(file, project)
            }
        }

        private fun update(file: VirtualFile, project: Project) = EditorNotifications.getInstance(project).updateNotifications(file)
    }

    companion object {
        /**
         * Key used to store the notification panel in an editor
         */
        val KEY = Key.create<DynamicResourceVirtualFilePanel>("software.aws.toolkits.jetbrains.core.dynamic.resource.information")
    }
}
