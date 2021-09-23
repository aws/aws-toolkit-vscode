// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic

import com.intellij.designer.clipboard.SimpleTransferable.getData
import com.intellij.diff.util.DiffUtil.getData
import com.intellij.ide.util.PropertiesComponent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.externalSystem.util.ui.DataView.Companion.getData
import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.help.HelpManager
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.util.Key
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.EditorNotificationPanel
import com.intellij.ui.EditorNotifications
import com.intellij.xdebugger.impl.frame.XDebugView.getData
import software.amazon.awssdk.profiles.ProfileFileLocation
import software.aws.toolkits.jetbrains.core.help.HelpIds
import software.aws.toolkits.jetbrains.services.dynamic.actions.BeginCreateResourceAction2
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message
import java.awt.event.ActionEvent

class DynamicResourceFileHelpNotificationProvider : EditorNotifications.Provider<DynamicResourceFileHelpNotificationProvider.DynamicResourceVirtualFileNotificationPanel>(), DumbAware {
    override fun getKey(): Key<DynamicResourceVirtualFileNotificationPanel> = KEY

    override fun createNotificationPanel(file: VirtualFile, fileEditor: FileEditor, project: Project): DynamicResourceVirtualFileNotificationPanel? {
        if (!isCreateDynamicResourceVirtualFile(file)) return null
        return DynamicResourceVirtualFileNotificationPanel(file, project, fileEditor)
    }

    private fun isCreateDynamicResourceVirtualFile(file: VirtualFile): Boolean = file is CreateDynamicResourceVirtualFile

    class DynamicResourceVirtualFileNotificationPanel(file: VirtualFile, project: Project, fileEditor: FileEditor) : EditorNotificationPanel() {
        init {
            val f = file as? CreateDynamicResourceVirtualFile ?: null
            //println(f?.dynamicResourceType)
            createActionLabel("View Documentation ${f?.dynamicResourceType}") {
                val str = "aws.toolkit.${f?.dynamicResourceType}"
                HelpManager.getInstance().invokeHelp(str)
            }




            text("Creating a resource: Enter resource properties, click Save")
        }

        private fun update(file: VirtualFile, project: Project) = EditorNotifications.getInstance(project).updateNotifications(file)
    }

    companion object {
        /**
         * Key used to store the notification panel in an editor
         */
        val KEY = Key.create<DynamicResourceVirtualFileNotificationPanel>("software.aws.toolkits.jetbrains.core.dynamic.resource.information")
    }
}

