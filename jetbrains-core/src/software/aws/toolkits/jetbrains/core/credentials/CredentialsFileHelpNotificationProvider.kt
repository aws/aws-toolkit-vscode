// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.ide.util.PropertiesComponent
import com.intellij.openapi.fileEditor.FileEditor
import com.intellij.openapi.help.HelpManager
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Key
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.EditorNotificationPanel
import com.intellij.ui.EditorNotifications
import software.amazon.awssdk.profiles.ProfileFileLocation
import software.aws.toolkits.jetbrains.core.credentials.CredentialsFileHelpNotificationProvider.CredentialFileNotificationPanel
import software.aws.toolkits.jetbrains.core.help.HelpIds
import software.aws.toolkits.resources.message

class CredentialsFileHelpNotificationProvider : EditorNotifications.Provider<CredentialFileNotificationPanel>(), DumbAware {
    override fun getKey(): Key<CredentialFileNotificationPanel> = KEY

    override fun createNotificationPanel(file: VirtualFile, fileEditor: FileEditor, project: Project): CredentialFileNotificationPanel? {
        // Check if user dismissed permanently
        if (PropertiesComponent.getInstance().isTrueValue(DISABLE_KEY)) return null
        // Check if user hid per editor tab
        if (fileEditor.getUserData(HIDE_KEY) != null) return null
        // Check if editor is for the config/credential file
        if (!isCredentialsFile(file)) return null

        return CredentialFileNotificationPanel(file, project, fileEditor)
    }

    private fun isCredentialsFile(file: VirtualFile): Boolean = try {
        val filePath = file.toNioPath().toAbsolutePath()
        ProfileFileLocation.configurationFilePath().toAbsolutePath() == filePath || ProfileFileLocation.credentialsFilePath().toAbsolutePath() == filePath
    } catch (e: Exception) {
        false
    }

    class CredentialFileNotificationPanel(file: VirtualFile, project: Project, fileEditor: FileEditor) : EditorNotificationPanel() {
        init {
            createActionLabel(message("general.help")) {
                HelpManager.getInstance().invokeHelp(HelpIds.SETUP_CREDENTIALS.id)
            }

            createActionLabel(message("general.notification.action.hide_once")) {
                dismiss(file, project, fileEditor)
            }

            createActionLabel(message("general.notification.action.hide_forever")) {
                hideForever(file, project)
            }

            text(message("credentials.file.notification"))
        }

        fun dismiss(file: VirtualFile, project: Project, fileEditor: FileEditor) {
            fileEditor.putUserData(HIDE_KEY, true)
            update(file, project)
        }

        fun hideForever(file: VirtualFile, project: Project) {
            PropertiesComponent.getInstance().setValue(DISABLE_KEY, true)
            update(file, project)
        }

        private fun update(file: VirtualFile, project: Project) = EditorNotifications.getInstance(project).updateNotifications(file)
    }

    companion object {
        /**
         * Key used to store the notification panel in an editor
         */
        val KEY = Key.create<CredentialFileNotificationPanel>("software.aws.toolkits.jetbrains.core.credentials.editor.notification.provider")

        /**
         * Key to indicate we should hide the panel (per editor)
         */
        private val HIDE_KEY = Key.create<Boolean>("software.aws.toolkits.jetbrains.core.credentials.editor.notification.hidden")

        /**
         * Name of the IDE wide setting to never show again
         */
        const val DISABLE_KEY = "software.aws.toolkits.jetbrains.core.credentials.editor.notification.disabled"
    }
}
