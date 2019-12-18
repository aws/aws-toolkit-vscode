// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.openapi.fileChooser.FileChooserFactory
import com.intellij.openapi.fileChooser.FileSaverDescriptor
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFileWrapper
import software.amazon.awssdk.services.s3.S3Client
import software.aws.toolkits.core.utils.allOf
import software.aws.toolkits.jetbrains.components.telemetry.ActionButtonWrapper
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.services.s3.download
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeObjectNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeTable
import software.aws.toolkits.jetbrains.services.s3.editor.S3VirtualBucket
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryConstants.TelemetryResult
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryService
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import java.io.File

class DownloadObjectAction(
    private val treeTable: S3TreeTable,
    val bucket: S3VirtualBucket
) : ActionButtonWrapper(message("s3.download.object.action"), null, AllIcons.Actions.Download) {

    @Suppress("unused")
    override fun doActionPerformed(e: AnActionEvent) {
        val project = e.getRequiredData(LangDataKeys.PROJECT)
        val client: S3Client = AwsClientManager.getInstance(project).getClient()
        val descriptor = FileSaverDescriptor(
            message("s3.download.object.action"), message("s3.download.object.description")
        )
        val saveFileDialog = FileChooserFactory.getInstance().createSaveFileDialog(descriptor, project)
        val baseDir = VfsUtil.getUserHomeDir()
        var baseFilePath: String? = ""

        var fileWrapper: VirtualFileWrapper? = null
        treeTable.getSelectedNodes().mapNotNull {
            if (it !is S3TreeObjectNode) {
                return@mapNotNull null
            }
            if (fileWrapper == null) {
                fileWrapper = saveFileDialog.save(baseDir, it.name)
                baseFilePath = fileWrapper?.file?.toString()?.substringBefore(it.name)
            } else {
                fileWrapper = VirtualFileWrapper(File("$baseFilePath${it.name}"))
            }
            /**
             * A single file saver dialog appears for first selection. All other objects
             * are saved in the same root location selected with the dialog.
             */
            fileWrapper?.let { fileWrapper ->
                downloadObjectAction(project, client, it, fileWrapper).whenComplete { _, error ->
                    error?.let {
                        error.notifyError(message("s3.download.object.failed"))
                        TelemetryService.recordSimpleTelemetry(project, SINGLE_OBJECT, TelemetryResult.Failed)
                    } ?: TelemetryService.recordSimpleTelemetry(project, SINGLE_OBJECT, TelemetryResult.Succeeded)
                }
            }
        }.allOf().whenComplete { _, error ->
            TelemetryService.recordSimpleTelemetry(
                project,
                ALL_OBJECTS,
                if (error == null) TelemetryResult.Succeeded else TelemetryResult.Failed,
                treeTable.selectedRows.size.toDouble()
            )
        }
    }

    override fun isEnabled(): Boolean = !(treeTable.isEmpty || (treeTable.selectedRow < 0) || (treeTable.getValueAt(treeTable.selectedRow, 1) == ""))

    fun downloadObjectAction(project: Project, client: S3Client, s3TreeObject: S3TreeObjectNode, fileWrapper: VirtualFileWrapper) = client.download(
        project,
        s3TreeObject.bucketName,
        s3TreeObject.key,
        fileWrapper.file.toPath(),
        message("s3.download.object.progress", s3TreeObject.name)
    )

    companion object {
        private const val SINGLE_OBJECT = "s3_downloadobject"
        private const val ALL_OBJECTS = "s3_downloadobjects"
    }
}
