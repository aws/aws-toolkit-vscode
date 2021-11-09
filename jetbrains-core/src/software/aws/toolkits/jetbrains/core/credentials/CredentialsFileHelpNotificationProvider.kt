// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.openapi.fileEditor.FileDocumentManager
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
import software.aws.toolkits.telemetry.AwsTelemetry

class CredentialsFileHelpNotificationProvider : EditorNotifications.Provider<CredentialFileNotificationPanel>(), DumbAware {
    override fun getKey(): Key<CredentialFileNotificationPanel> = KEY

    override fun createNotificationPanel(file: VirtualFile, fileEditor: FileEditor, project: Project): CredentialFileNotificationPanel? {
        // Check if editor is for the config/credential file
        if (!isCredentialsFile(file)) return null

        return CredentialFileNotificationPanel(project)
    }

    private fun isCredentialsFile(file: VirtualFile): Boolean = try {
        val filePath = file.toNioPath().toAbsolutePath()
        ProfileFileLocation.configurationFilePath().toAbsolutePath() == filePath || ProfileFileLocation.credentialsFilePath().toAbsolutePath() == filePath
    } catch (e: Exception) {
        false
    }

    class CredentialFileNotificationPanel(project: Project) : EditorNotificationPanel() {
        init {
            createActionLabel(message("general.save")) {
                FileDocumentManager.getInstance().saveAllDocuments()
                AwsTelemetry.saveCredentials(project = project)
            }

            createActionLabel(message("general.help")) {
                HelpManager.getInstance().invokeHelp(HelpIds.SETUP_CREDENTIALS.id)
                AwsTelemetry.help(project = project, name = HelpIds.SETUP_CREDENTIALS.id)
            }

            text(message("credentials.file.notification"))
        }
    }

    companion object {
        /**
         * Key used to store the notification panel in an editor
         */
        val KEY = Key.create<CredentialFileNotificationPanel>("software.aws.toolkits.jetbrains.core.credentials.editor.notification.provider")
    }
}
