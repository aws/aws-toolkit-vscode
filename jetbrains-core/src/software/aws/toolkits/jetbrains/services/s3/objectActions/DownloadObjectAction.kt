// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileChooser.FileChooserFactory
import com.intellij.openapi.fileChooser.FileSaverDescriptor
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.vfs.VirtualFileWrapper
import software.amazon.awssdk.core.sync.ResponseTransformer
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.GetObjectRequest
import software.aws.toolkits.jetbrains.components.telemetry.ActionButtonWrapper
import software.aws.toolkits.jetbrains.services.s3.S3VirtualBucket
import software.aws.toolkits.jetbrains.services.s3.bucketEditor.S3TreeTable
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
        val client = bucket.client
        val descriptor = FileSaverDescriptor(
            message("s3.download.object.action"), message("s3.download.object.description")
        )
        val saveFileDialog = FileChooserFactory.getInstance().createSaveFileDialog(descriptor, project)
        val baseDir = VfsUtil.getUserHomeDir()
        var baseFilePath: String? = ""

        var fileWrapper: VirtualFileWrapper? = null
        treeTable.getSelectedAsVirtualFiles().forEach {
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
                ApplicationManager.getApplication().executeOnPooledThread {
                    try {
                        downloadObjectAction(project, client, it, fileWrapper)
                    } catch (e: Exception) {
                        notifyError(message("s3.download.object.failed"))
                    }
                }
            }
        }
    }

    override fun isEnabled(): Boolean = !(treeTable.isEmpty || (treeTable.selectedRow < 0) ||
        (treeTable.getValueAt(treeTable.selectedRow, 1) == ""))

    fun downloadObjectAction(project: Project, client: S3Client, file: VirtualFile, fileWrapper: VirtualFileWrapper) {
        val bucketName = bucket.getVirtualBucketName()
        val request = GetObjectRequest.builder()
            .bucket(bucketName)
            .key(file.name)
            .build()
        ProgressManager.getInstance().run(object : Task.Backgroundable(project, message("s3.download.object.progress", file.name), true) {
            override fun run(indicator: ProgressIndicator) {
                val fileOutputStream = fileWrapper.file.outputStream()
                val progressStream = ProgressOutputStream(
                    fileOutputStream,
                    file.length,
                    indicator
                )
                client.getObject(request, ResponseTransformer.toOutputStream(progressStream))
            }
        })
    }
}
