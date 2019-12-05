// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.ui.Messages
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.Delete
import software.amazon.awssdk.services.s3.model.DeleteObjectsRequest
import software.amazon.awssdk.services.s3.model.ObjectIdentifier
import software.aws.toolkits.jetbrains.components.telemetry.ActionButtonWrapper
import software.aws.toolkits.jetbrains.services.s3.S3VirtualBucket
import software.aws.toolkits.jetbrains.services.s3.S3VirtualDirectory
import software.aws.toolkits.jetbrains.services.s3.bucketEditor.S3KeyNode
import software.aws.toolkits.jetbrains.services.s3.bucketEditor.S3TreeTable
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message
import javax.swing.JButton
import javax.swing.JTextField
import javax.swing.tree.DefaultMutableTreeNode

class DeleteObjectAction(
    private var treeTable: S3TreeTable,
    val bucket: S3VirtualBucket,
    private val searchButton: JButton,
    private val searchTextField: JTextField
) : ActionButtonWrapper(message("s3.delete.object.action"), null, AllIcons.Actions.Cancel) {

    @Suppress("unused")
    override fun doActionPerformed(e: AnActionEvent) {
        val project = e.getRequiredData(LangDataKeys.PROJECT)
        val client: S3Client = bucket.client
        val rows = treeTable.selectedRows
        val objectsToDelete = mutableListOf<ObjectIdentifier>()

        for (row in rows) {
            val path = treeTable.tree.getPathForRow(treeTable.convertRowIndexToModel(row))
            val node = (path.lastPathComponent as DefaultMutableTreeNode).userObject as S3KeyNode
            val file = node.virtualFile
            val key = when (file.parent is S3VirtualDirectory) {
                true -> "${file.parent.name}/${file.name}"
                false -> file.name
            }
            objectsToDelete.add(ObjectIdentifier.builder().key(key).build())
        }

        val response = Messages.showOkCancelDialog(
            project,
            message("s3.delete.object.description", rows.size),
            message("s3.delete.object.action"),
            message("s3.delete.object.delete"),
            message("s3.delete.object.cancel"), Messages.getWarningIcon()
        )
        if (response == 0) {
            ApplicationManager.getApplication().executeOnPooledThread {
                try {
                    deleteObjectAction(client, objectsToDelete)
                    treeTable.refresh()
                    if (searchTextField.text.isNotEmpty()) {
                        searchButton.doClick()
                        treeTable.refresh()
                    }
                } catch (e: Exception) {
                    notifyInfo(message("s3.delete.object.failed"))
                }
            }
        }
    }

    override fun isEnabled(): Boolean = (!(treeTable.isEmpty || (treeTable.selectedRow < 0) ||
        (treeTable.getValueAt(treeTable.selectedRow, 1) == "")))

    fun deleteObjectAction(client: S3Client, objectsToDelete: MutableList<ObjectIdentifier>) {
        val bucketName = bucket.getVirtualBucketName()
        val deleteObjectsRequest = DeleteObjectsRequest.builder()
            .bucket(bucketName)
            .delete(Delete.builder().objects(objectsToDelete).build())
            .build()
        client.deleteObjects(deleteObjectsRequest)
    }
}
