// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import org.jetbrains.annotations.TestOnly
import software.amazon.awssdk.profiles.ProfileFileLocation
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.AwsTelemetry
import java.io.File

class CreateOrUpdateCredentialProfilesAction @TestOnly constructor(
    private val writer: ConfigFileWriter,
    private val configFile: File,
    private val credentialsFile: File
) : AnAction(message("configure.toolkit.upsert_credentials.action")), DumbAware {
    @Suppress("unused")
    constructor() : this(
        DefaultConfigFileWriter,
        ProfileFileLocation.configurationFilePath().toFile(),
        ProfileFileLocation.credentialsFilePath().toFile()
    )

    private val localFileSystem = LocalFileSystem.getInstance()

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.getRequiredData(PlatformDataKeys.PROJECT)

        // if both config and credential files do not exist, create a new config file
        if (!configFile.exists() && !credentialsFile.exists()) {
            if (confirm(project, configFile)) {
                writer.createFile(configFile)
            } else {
                return
            }
        }

        // open both config and credential files, if they exist
        // credential file is opened last since it takes precedence over the config file
        val virtualFiles = listOf(configFile, credentialsFile).filter { it.exists() }.map {
            localFileSystem.refreshAndFindFileByIoFile(it) ?: throw RuntimeException(message("credentials.could_not_open", it))
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

    private fun confirm(project: Project, file: File): Boolean = Messages.showOkCancelDialog(
        project,
        message("configure.toolkit.upsert_credentials.confirm_file_create", file),
        message("configure.toolkit.upsert_credentials.confirm_file_create.title"),
        message("configure.toolkit.upsert_credentials.confirm_file_create.okay"),
        Messages.CANCEL_BUTTON,
        AllIcons.General.QuestionDialog,
        null
    ) == Messages.OK
}

interface ConfigFileWriter {
    fun createFile(file: File)
}

object DefaultConfigFileWriter : ConfigFileWriter {
    val TEMPLATE = """
        # Amazon Web Services Config File used by AWS CLI, SDKs, and tools
        # This file was created by the AWS Toolkit for JetBrains plugin.
        #
        # Your AWS credentials are represented by access keys associated with IAM users.
        # For information about how to create and manage AWS access keys for a user, see:
        # https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html
        #
        # This config file can store multiple access keys by placing each one in a
        # named "profile". For information about how to change the access keys in a
        # profile or to add a new profile with a different access key, see:
        # https://docs.aws.amazon.com/cli/latest/userguide/cli-config-files.html
        #
        # If both a credential and config file exists, the values in the credential file
        # take precedence

        [default]
        # The access key and secret key pair identify your account and grant access to AWS.
        aws_access_key_id = [accessKey]
        # Treat your secret key like a password. Never share your secret key with anyone. Do
        # not post it in online forums, or store it in a source control system. If your secret
        # key is ever disclosed, immediately use IAM to delete the access key and secret key
        # and create a new key pair. Then, update this file with the replacement key details.
        aws_secret_access_key = [secretKey]

        # [profile user1]
        # aws_access_key_id = [accessKey1]
        # aws_secret_access_key = [secretKey1]
    """.trimIndent()

    override fun createFile(file: File) {
        val parent = file.parentFile
        if (parent.mkdirs()) {
            parent.setReadable(false, false)
            parent.setReadable(true)
            parent.setWritable(false, false)
            parent.setWritable(true)
            parent.setExecutable(false, false)
            parent.setExecutable(true)
        }

        file.writeText(TEMPLATE)

        file.setReadable(false, false)
        file.setReadable(true)
        file.setWritable(false, false)
        file.setWritable(true)
        file.setExecutable(false, false)
        file.setExecutable(false)
    }
}
