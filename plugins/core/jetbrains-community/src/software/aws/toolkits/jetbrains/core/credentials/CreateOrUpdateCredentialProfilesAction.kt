// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.PlatformDataKeys
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.fileTypes.FileTypes
import com.intellij.openapi.fileTypes.ex.FileTypeManagerEx
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.vfs.LocalFileSystem
import icons.AwsIcons
import org.jetbrains.annotations.TestOnly
import software.amazon.awssdk.profiles.ProfileFileLocation
import software.aws.toolkits.core.utils.exists
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.AwsTelemetry
import java.nio.file.Path

class CreateOrUpdateCredentialProfilesAction @TestOnly constructor(
    private val writer: ConfigFilesFacade
) : AnAction(
    message("configure.toolkit.upsert_credentials.action"),
    null,
    AwsIcons.Logos.AWS
),
    DumbAware {
    @Suppress("unused")
    constructor() : this(
        DefaultConfigFilesFacade(
            configPath = ProfileFileLocation.configurationFilePath(),
            credentialsPath = ProfileFileLocation.credentialsFilePath()
        )
    )

    private val localFileSystem = LocalFileSystem.getInstance()

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.getRequiredData(PlatformDataKeys.PROJECT)

        // if both config and credential files do not exist, create a new config file
        if (!writer.configPath.exists() && !writer.credentialsPath.exists()) {
            if (confirm(project, writer.configPath)) {
                try {
                    writer.createConfigFile()
                } finally {
                    AwsTelemetry.createCredentials(project)
                }
            } else {
                return
            }
        }

        // open both config and credential files, if they exist
        // credential file is opened last since it takes precedence over the config file
        val virtualFiles = listOf(writer.configPath.toFile(), writer.credentialsPath.toFile()).filter { it.exists() }.map {
            localFileSystem.refreshAndFindFileByIoFile(it) ?: throw RuntimeException(
                message(
                    "credentials.could_not_open",
                    it
                )
            )
        }

        val fileEditorManager = FileEditorManager.getInstance(project)

        localFileSystem.refreshFiles(virtualFiles, false, false) {
            virtualFiles.forEach {
                if (it.fileType == FileTypes.UNKNOWN) {
                    ApplicationManager.getApplication().runWriteAction {
                        FileTypeManagerEx.getInstanceEx().associatePattern(
                            FileTypes.PLAIN_TEXT,
                            it.name
                        )
                    }
                }

                if (fileEditorManager.openTextEditor(OpenFileDescriptor(project, it), true) == null) {
                    AwsTelemetry.openCredentials(project, success = false)
                    throw RuntimeException(message("credentials.could_not_open", it))
                }
                AwsTelemetry.openCredentials(project, success = true)
            }
        }
    }

    private fun confirm(project: Project, file: Path): Boolean = Messages.showOkCancelDialog(
        project,
        message("configure.toolkit.upsert_credentials.confirm_file_create", file),
        message("configure.toolkit.upsert_credentials.confirm_file_create.title"),
        message("configure.toolkit.upsert_credentials.confirm_file_create.okay"),
        Messages.getCancelButton(),
        AllIcons.General.QuestionDialog,
        null
    ) == Messages.OK
}
