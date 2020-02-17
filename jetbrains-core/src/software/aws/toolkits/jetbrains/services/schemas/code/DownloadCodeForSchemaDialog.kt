// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.schemas.code

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project
import com.intellij.openapi.roots.ProjectFileIndex
import com.intellij.openapi.roots.ProjectRootManager
import com.intellij.openapi.ui.DialogWrapper
import com.intellij.openapi.ui.ValidationInfo
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.vfs.VfsUtil
import org.apache.commons.lang.exception.ExceptionUtils
import software.amazon.awssdk.services.schemas.model.SchemaVersionSummary
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.AwsResourceCache
import software.aws.toolkits.jetbrains.core.help.HelpIds
import software.aws.toolkits.jetbrains.services.lambda.RuntimeGroup
import software.aws.toolkits.jetbrains.services.schemas.Schema
import software.aws.toolkits.jetbrains.services.schemas.SchemaCodeLangs
import software.aws.toolkits.jetbrains.services.schemas.SchemaSummary
import software.aws.toolkits.jetbrains.services.schemas.resources.SchemasResources
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.jetbrains.utils.ui.selected
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.SchemaLanguage
import software.aws.toolkits.telemetry.SchemasTelemetry
import java.awt.event.ActionEvent
import java.io.File
import java.util.ArrayList
import java.util.concurrent.CompletableFuture
import java.util.concurrent.CompletionStage
import javax.swing.Action
import javax.swing.JComponent

private val NOTIFICATION_TITLE = message("schemas.service_name")

class DownloadCodeForSchemaDialog(
    private val project: Project,
    private val schemaName: String = "",
    private val registryName: String = "",
    private val version: String? = null,
    private val language: SchemaCodeLangs? = null,
    private val onClose: (() -> Unit)? = null
) : DialogWrapper(project) {

    constructor(project: Project, schema: Schema) :
        this(
            project = project,
            schemaName = schema.name,
            registryName = schema.registryName
        )

    val schemaVersions: List<String>
    val latestVersion: String

    val view = DownloadCodeForSchemaPanel(project, this)
    val validator = DownloadCodeForSchemaValidator()

    private val action: OkAction = DownloadCodeForSchemaOkAction()

    init {
        super.init()
        title = message("schemas.schema.download_code_bindings.title")

        view.heading.text = message("schemas.schema.download_code_bindings.heading", schemaName, registryName)

        schemaVersions = loadSchemaVersions()

        val allVersions = ArrayList<String>(schemaVersions)
        latestVersion = allVersions.first()
        allVersions.add(0, LATEST_VERSION)

        view.setVersions(allVersions)
        view.version.selectedItem = version ?: LATEST_VERSION

        view.setLanguages(SchemaCodeLangs.values().asList())
        view.language.selectedItem = language ?: getLanguageForCurrentRuntime()

        view.location.textField.text = getContentRootOfCurrentFile() ?: ""
    }

    private fun getContentRootOfCurrentFile(): String? {
        // Get the currently open files (plural in case they are split)
        val selectedFiles = FileEditorManager.getInstance(project).getSelectedFiles()
        if (!selectedFiles.isEmpty()) {
            // return the content root of the first selected file
            return ProjectFileIndex.getInstance(project).getContentRootForFile(selectedFiles.first())?.path
        }
        // Otherwise, find the first content root of the project, and return that
        val contentRoots = ProjectRootManager.getInstance(project).contentRoots
        if (!contentRoots.isEmpty()) {
            return contentRoots.first()?.path
        }

        return null
    }

    private fun loadSchemaVersions(): List<String> =
        AwsResourceCache.getInstance(project)
            .getResourceNow(SchemasResources.getSchemaVersions(registryName, schemaName))
            .map(SchemaVersionSummary::schemaVersion)
            .sortedByDescending { s -> s.toIntOrNull() }

    private fun getLanguageForCurrentRuntime(): SchemaCodeLangs? {
        val currentRuntimeGroup = RuntimeGroup.determineRuntimeGroup(project) ?: return null

        return SchemaCodeLangs.values().firstOrNull { it.runtimeGroup.equals(currentRuntimeGroup) }
    }

    override fun createCenterPanel(): JComponent? = view.content

    override fun getPreferredFocusedComponent(): JComponent? = view.version

    override fun doValidate(): ValidationInfo? = validator.validate(view)

    override fun getOKAction(): Action = action

    override fun doOKAction() {
        // Do nothing, close logic is handled separately
    }

    override fun getHelpId(): String? = HelpIds.DOWNLOAD_CODE_FOR_SCHEMA_DIALOG.id

    fun downloadSchemaCode(schemaCodeDownloader: SchemaCodeDownloader) {
        if (!okAction.isEnabled) {
            return
        }
        val schemaCodeDownloadDetails = viewToSchemaCodeDownloadDetails()

        // Telemetry for download code language
        SchemasTelemetry.download(project, success = true, schemalanguage = SchemaLanguage.from(schemaCodeDownloadDetails.language.apiValue))

        val schemaName = schemaCodeDownloadDetails.schema.name
        ProgressManager.getInstance().run(object : Task.Backgroundable(project, message("schemas.schema.download_code_bindings.title", schemaName), false) {
            override fun run(indicator: ProgressIndicator) {
                notifyInfo(
                    title = NOTIFICATION_TITLE,
                    content = message("schemas.schema.download_code_bindings.notification.start", schemaName),
                    project = project
                )

                schemaCodeDownloader.downloadCode(schemaCodeDownloadDetails, indicator)
                    .thenCompose { schemaCoreCodeFile ->
                        refreshDownloadCodeDirectory(schemaCodeDownloadDetails)
                        openSchemaCoreCodeFileInEditor(schemaCoreCodeFile, project)
                    }
                    .thenApply {
                        showDownloadCompletionNotification(schemaName, project)
                    }
                    .exceptionally { error ->
                        showDownloadCompletionErrorNotification(error, project)
                    }
                    .toCompletableFuture().get()
            }
        })

        onClose?.let { it() }

        close(OK_EXIT_CODE)
    }

    private fun refreshDownloadCodeDirectory(schemaCodeDownloadDetails: SchemaCodeDownloadRequestDetails) {
        val file = File(schemaCodeDownloadDetails.destinationDirectory)

        // Don't replace this with LocalFileSystem.getInstance().refreshIoFiles(listOf(file)) - it doesn't work.
        val vFile = LocalFileSystem.getInstance().findFileByIoFile(file)
        VfsUtil.markDirtyAndRefresh(false, true, true, vFile)
    }

    private fun showDownloadCompletionNotification(
        schemaName: String,
        project: Project
    ) {
        val message = message("schemas.schema.download_code_bindings.notification.finished", schemaName)
        notifyInfo(title = NOTIFICATION_TITLE, content = message, project = project)
        SchemasTelemetry.download(project, success = true)
    }

    private fun showDownloadCompletionErrorNotification(
        error: Throwable?,
        project: Project
    ) {
        val rootError = ExceptionUtils.getRootCause(error)
        when (rootError) {
            is SchemaCodeDownloadFileCollisionException -> notifyError(title = NOTIFICATION_TITLE, content = rootError.message ?: "", project = project)
            is Exception -> rootError.notifyError(title = NOTIFICATION_TITLE, project = project)
        }
        SchemasTelemetry.download(project, success = false)
    }

    private fun openSchemaCoreCodeFileInEditor(
        schemaCoreCodeFile: File?,
        project: Project
    ): CompletionStage<Void> {
        val future = CompletableFuture<Void>()
        ApplicationManager.getApplication().invokeLater {
            try {
                schemaCoreCodeFile?.let {
                    val vSchemaCoreCodeFileName = LocalFileSystem.getInstance().findFileByIoFile(schemaCoreCodeFile)
                    vSchemaCoreCodeFileName?.let {
                        val fileEditorManager = FileEditorManager.getInstance(project)
                        fileEditorManager.openTextEditor(OpenFileDescriptor(project, it), true)
                    }
                }

                future.complete(null)
            } catch (e: Exception) {
                future.completeExceptionally(e)
            }
        }

        return future
    }

    private fun viewToSchemaCodeDownloadDetails(): SchemaCodeDownloadRequestDetails = SchemaCodeDownloadRequestDetails(
        schema = SchemaSummary(this.schemaName, this.registryName),
        version = getSelectedVersion(),
        language = view.language.selected()!!,
        destinationDirectory = view.location.text
    )

    private fun getSelectedVersion(): String {
        val selected = view.version.selected()!!
        if (selected == LATEST_VERSION) {
            return latestVersion
        }
        return selected
    }

    private inner class DownloadCodeForSchemaOkAction : OkAction() {
        init {
            putValue(Action.NAME, message("schemas.schema.download_code_bindings.download"))
        }

        override fun doAction(e: ActionEvent) {
            super.doAction(e)
            if (doValidateAll().isNotEmpty()) return

            downloadSchemaCode(SchemaCodeDownloader.create(AwsClientManager.getInstance(project)))
        }
    }

    companion object {
        val LATEST_VERSION = message("schemas.schema.download_code_bindings.latest")
    }
}

class DownloadCodeForSchemaValidator {
    fun validate(view: DownloadCodeForSchemaPanel): ValidationInfo? {
        if (view.version.selectedIndex < 0) {
            return ValidationInfo(message("schemas.schema.download_code_bindings.validation.version_required"), view.version)
        }

        if (view.language.selectedIndex < 0) {
            return ValidationInfo(message("schemas.schema.download_code_bindings.validation.language_required"), view.language)
        }

        val locationText = view.location.getText()
        if (locationText.isNullOrEmpty()) {
            return ValidationInfo(message("schemas.schema.download_code_bindings.validation.fileLocation_required"), view.location)
        }
        val file = File(locationText)
        if (!file.exists() || !file.isDirectory()) {
            return ValidationInfo(message("schemas.schema.download_code_bindings.validation.fileLocation_invalid"), view.location)
        }

        return null
    }
}
