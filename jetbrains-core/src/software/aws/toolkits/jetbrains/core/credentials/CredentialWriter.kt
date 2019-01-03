// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.credentials

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.PlatformDataKeys
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.fileTypes.UnknownFileType
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.vfs.LocalFileSystem
import org.jetbrains.annotations.TestOnly
import software.amazon.awssdk.profiles.ProfileFileSystemSetting
import software.amazon.awssdk.utils.JavaSystemSetting
import software.amazon.awssdk.utils.StringUtils
import software.aws.toolkits.jetbrains.components.telemetry.AnActionWrapper
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message
import java.io.File
import java.nio.file.FileSystems
import java.nio.file.Path
import java.nio.file.Paths
import java.util.regex.Pattern

class CreateOrUpdateCredentialProfilesAction @TestOnly constructor(
    private val writer: CredentialFileWriter,
    private val file: File
) : AnActionWrapper(message("configure.toolkit.upsert_credentials.action")), DumbAware {
    @Suppress("unused")
    constructor() : this(DefaultCredentialFileWriter, FileLocation.credentialsFileLocationPath().toFile())

    private val localFileSystem = LocalFileSystem.getInstance()

    override fun doActionPerformed(e: AnActionEvent) {
        val project = e.getRequiredData(PlatformDataKeys.PROJECT)

        if (!file.exists()) {
            if (confirm(project, file)) {
                writer.createFile(file)
            } else {
                return
            }
        }

        val virtualFile = localFileSystem.refreshAndFindFileByIoFile(file) ?: throw RuntimeException(message("credentials.could_not_open", file))
        virtualFile.isWritable = true
        if (virtualFile.fileType is UnknownFileType && virtualFile.length == 0L) {
            throw RuntimeException(message("credentials.empty_file", file))
        }

        val fileEditorManager = FileEditorManager.getInstance(project)

        localFileSystem.refreshFiles(listOf(virtualFile), false, false) {
            fileEditorManager.openTextEditor(OpenFileDescriptor(project, virtualFile), true)
                ?: throw RuntimeException(message("credentials.could_not_open", file))

            // TODO : remove message (and localized string) when credentials auto-refreshing is supported
            notifyInfo("", message("credentials.notification.restart.ide"))
        }
    }

    private fun confirm(project: Project, file: File): Boolean = Messages.showOkCancelDialog(
        project,
        message("configure.toolkit.upsert_credentials.confirm_file_create", file),
        message("configure.toolkit.upsert_credentials.confirm_file_create.title"),
        AllIcons.General.QuestionDialog
    ) == Messages.OK
}

interface CredentialFileWriter {
    fun createFile(file: File)
}

object DefaultCredentialFileWriter : CredentialFileWriter {
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

        file.writeText(
            """
                [default]
                aws_access_key_id=
                aws_secret_access_key=
            """.trimIndent()
        )

        file.setReadable(false, false)
        file.setReadable(true)
        file.setWritable(false, false)
        file.setWritable(true)
        file.setExecutable(false, false)
        file.setExecutable(false)
    }
}

// TODO: remove this, when https://github.com/aws/aws-sdk-java-v2/pull/730 is merged & released
private object FileLocation {
    private val HOME_DIRECTORY_PATTERN = Pattern.compile("^~(/|" + Pattern.quote(FileSystems.getDefault().separator) + ").*$")

    /**
     * Load the location for the credentials file, regardless of whether it actually exists
     */
    fun credentialsFileLocationPath() = resolveProfileFilePath(
        ProfileFileSystemSetting.AWS_SHARED_CREDENTIALS_FILE.stringValue
            .orElse(Paths.get(userHomeDirectory(), ".aws", "credentials").toString())
    )

    private fun userHomeDirectory(): String {
        val isWindows = JavaSystemSetting.OS_NAME.stringValue
            .map { s -> StringUtils.lowerCase(s).startsWith("windows") }
            .orElse(false)

        // To match the logic of the CLI we have to consult environment variables directly.
        // CHECKSTYLE:OFF
        val home = System.getenv("HOME")

        if (home != null) {
            return home
        }

        if (isWindows) {
            val userProfile = System.getenv("USERPROFILE")

            if (userProfile != null) {
                return userProfile
            }

            val homeDrive = System.getenv("HOMEDRIVE")
            val homePath = System.getenv("HOMEPATH")

            if (homeDrive != null && homePath != null) {
                return homeDrive + homePath
            }
        }

        return JavaSystemSetting.USER_HOME.stringValueOrThrow
        // CHECKSTYLE:ON
    }

    private fun resolveProfileFilePath(path: String): Path {
        var pathBuilder = path
        // Resolve ~ using the CLI's logic, not whatever Java decides to do with it.
        if (HOME_DIRECTORY_PATTERN.matcher(path).matches()) {
            pathBuilder = userHomeDirectory() + path.substring(1)
        }
        return Paths.get(pathBuilder)
    }
}