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
import software.aws.toolkits.jetbrains.services.s3.S3VirtualBucket
import software.aws.toolkits.jetbrains.services.s3.S3VirtualDirectory
import software.aws.toolkits.jetbrains.services.s3.bucketEditor.S3KeyNode
import software.aws.toolkits.jetbrains.services.s3.bucketEditor.S3TreeTable
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import javax.swing.JButton
import javax.swing.JTextField
import javax.swing.tree.DefaultMutableTreeNode

class UploadObjectAction(
    val bucket: S3VirtualBucket,
    private val treeTable: S3TreeTable,
    private val searchButton: JButton,
    private val searchTextField: JTextField
) : ActionButtonWrapper(message("s3.upload.object.action"), null, AllIcons.Actions.Upload) {

    @Suppress("unused")
    override fun doActionPerformed(e: AnActionEvent) {
        val project = e.getRequiredData(LangDataKeys.PROJECT)
        val client: S3Client = bucket.s3Bucket.client
        val descriptor = FileChooserDescriptorFactory.createMultipleFilesNoJarsDescriptor()
            .withDescription(message("s3.upload.object.action"))

        val row = treeTable.selectedRow
        var nodeFile: VirtualFile? = null
        if (row > 0) {
            val path = treeTable.tree.getPathForRow(treeTable.convertRowIndexToModel(row))
            val node = (path.lastPathComponent as DefaultMutableTreeNode).userObject as S3KeyNode
            nodeFile = node.virtualFile
        }
        val chooserDialog = FileChooserFactory.getInstance().createFileChooser(descriptor, project, null)
        val filesChosen = chooserDialog.choose(project, null)
        for (fileChosen in filesChosen) {
            ApplicationManager.getApplication().executeOnPooledThread {
                try {
                    uploadObjectAction(client, project, fileChosen, nodeFile)
                    treeTable.refresh()
                    if (searchTextField.text.isNotEmpty()) {
                        searchButton.doClick()
                        treeTable.refresh()
                    }
                } catch (e: Exception) {
                    notifyError(message("s3.upload.object.failed"))
                }
            }
        }
    }

    override fun isEnabled(): Boolean = treeTable.isEmpty || !(treeTable.selectedRows.size > 1)

    fun uploadObjectAction(
        client: S3Client,
        project: Project,
        fileChosen: VirtualFile,
        nodeFile: VirtualFile?
    ) {
        val bucketName = bucket.getVirtualBucketName()
        var key: String
        if (nodeFile is S3VirtualDirectory) {
            key = "${nodeFile.name}/${fileChosen.name}"
        } else if (nodeFile?.parent is S3VirtualDirectory) {
            key = "${nodeFile.parent.name}/${fileChosen.name}"
        } else {
            key = fileChosen.name
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