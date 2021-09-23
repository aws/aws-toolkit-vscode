// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.dynamic

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.help.HelpManager
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.util.Key
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.psi.PsiManager
import com.intellij.ui.EditorNotificationPanel
import com.intellij.ui.EditorNotifications
import software.aws.toolkits.jetbrains.services.dynamic.actions.BeginCreateResourceAction2
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message
import java.awt.event.ActionEvent

class DynamicResourceFileHelpNotificationProvider : EditorNotifications.Provider<DynamicResourceFileHelpNotificationProvider.DynamicResourceVirtualFileNotificationPanel>(), DumbAware {
    override fun getKey(): Key<DynamicResourceVirtualFileNotificationPanel> = KEY

    override fun createNotificationPanel(file: VirtualFile, fileEditor: FileEditor, project: Project): DynamicResourceVirtualFileNotificationPanel? {
        return if (file is CreateDynamicResourceVirtualFile) CreateDynamicResourceVirtualFileNotificationPanel(file, project, fileEditor)
        else if (file is ViewEditableDynamicResourceVirtualFile) ViewEditableDynamicResourceVirtualFileNotificationPanel(file, project, fileEditor)
        else null
    }

    private fun isDynamicResourceVirtualFile(file: VirtualFile): Boolean = file is DynamicResourceVirtualFile
    private fun isViewEditableDynamicResourceVirtualFile(file: VirtualFile): Boolean = file is ViewEditableDynamicResourceVirtualFile

    abstract class DynamicResourceVirtualFileNotificationPanel : EditorNotificationPanel() {
    }

    class CreateDynamicResourceVirtualFileNotificationPanel(file: VirtualFile, project: Project, fileEditor: FileEditor) :
        DynamicResourceVirtualFileNotificationPanel() {
        init {
            val f = file as CreateDynamicResourceVirtualFile
            createActionLabel("View Documentation") {
                val str = "aws.toolkit.${f.dynamicResourceType}"
                HelpManager.getInstance().invokeHelp(str)
            }

            createActionLabel("Create", "dynamic.resource.create.floating.action") /*{
                val psiFile = PsiManager.getInstance(project).findFile(file) ?: throw IllegalStateException("File not found")
                //val file = psiFile?.virtualFile as? CreateDynamicResourceVirtualFile
                //val resourceType = f?.dynamicResourceType
                val contentString = psiFile.text
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
                        message("dynamic_resources.resource_creation", file.dynamicResourceType),
                        message("dynamic_resources.begin_resource_creation", file.dynamicResourceType),
                        psiFile.project
                    )
                    DynamicResourceUpdateManager.getInstance(psiFile.project).createResource(file.connectionSettings, file.dynamicResourceType, contentString)
                }

            }*/




            text("Creating a resource: Enter resource properties, click Create")
        }

        private fun update(file: VirtualFile, project: Project) = EditorNotifications.getInstance(project).updateNotifications(file)
    }

    class ViewEditableDynamicResourceVirtualFileNotificationPanel(file: VirtualFile, project: Project, fileEditor: FileEditor) :
        DynamicResourceVirtualFileNotificationPanel() {
        init {
            val f = file as ViewEditableDynamicResourceVirtualFile
            createActionLabel("View Documentation") {
                val str = "aws.toolkit.${f.dynamicResourceType}"
                HelpManager.getInstance().invokeHelp(str)
            }
            if(!file.isWritable){
                createActionLabel("Edit", "dynamic.resource.update.floating.action")
                update(file, project)
            }
            else{
                createActionLabel("Update", "dynamic.resource.save.update.floating.action")
                update(file, project)
            }







            text("${file.dynamicResourceIdentifier.resourceIdentifier}")
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

