// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.fileChooser.FileChooserFactory
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.ProgressManager
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import software.aws.toolkits.jetbrains.components.telemetry.ActionButtonWrapper
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.services.s3.S3VirtualBucket
import software.aws.toolkits.jetbrains.services.s3.bucketEditor.S3TreeContinuationNode
import software.aws.toolkits.jetbrains.services.s3.bucketEditor.S3TreeNode
import software.aws.toolkits.jetbrains.services.s3.bucketEditor.S3TreeTable
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message

class UploadObjectAction(
    val bucket: S3VirtualBucket,
    private val treeTable: S3TreeTable
) : ActionButtonWrapper(message("s3.upload.object.action", bucket.name), null, AllIcons.Actions.Upload) {
    override fun doActionPerformed(e: AnActionEvent) {
        val project = e.getRequiredData(LangDataKeys.PROJECT)
        val client: S3Client = AwsClientManager.getInstance(project).getClient()

        val node = treeTable.getSelectedNodes().firstOrNull() ?: return
        val descriptor = FileChooserDescriptorFactory.createMultipleFilesNoJarsDescriptor().withDescription(message("s3.upload.object.action", bucket.name))
        val chooserDialog = FileChooserFactory.getInstance().createFileChooser(descriptor, project, null)
        val filesChosen = chooserDialog.choose(project, null)
        for (fileChosen in filesChosen) {
            ApplicationManager.getApplication().executeOnPooledThread {
                try {
                    uploadObjectAction(client, project, fileChosen, node)
                    treeTable.invalidateLevel(node)
                    treeTable.refresh()
                } catch (e: Exception) {
                    notifyError(message("s3.upload.object.failed"))
                }
            }
        }
    }

    override fun isEnabled(): Boolean =
        (treeTable.isEmpty || treeTable.selectedRows.size <= 1) && !treeTable.getSelectedNodes().any { it is S3TreeContinuationNode }

    fun uploadObjectAction(
        client: S3Client,
        project: Project,
        fileChosen: VirtualFile,
        node: S3TreeNode
    ) {
        val bucketName = node.bucketName
        val key = if (node.isDirectory) {
            node.key + fileChosen.name
        } else {
            val parentPath =
                node.parent?.key ?: throw IllegalStateException("When uploading, ${node.key} claimed it was not a directory but has no parent!")
            parentPath + fileChosen.name
        }

        val request = PutObjectRequest.builder()
            .bucket(bucketName)
            .key(key)
            .build()

        val fileChosenSize = fileChosen.inputStream.readBytes().size

        ProgressManager.getInstance()
            .run(object : Task.Modal(project, message("s3.upload.object.progress", fileChosen.name), false) {
                override fun run(indicator: ProgressIndicator) {
                    val pStream = ProgressInputStream(fileChosen.inputStream, fileChosenSize, indicator)
                    client.putObject(request, RequestBody.fromInputStream(pStream, fileChosen.length))
                }
            })
    }
}
