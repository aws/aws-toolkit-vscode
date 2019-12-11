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
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.services.s3.S3VirtualBucket
import software.aws.toolkits.jetbrains.services.s3.bucketEditor.S3TreeTable
import software.aws.toolkits.jetbrains.utils.notifyInfo
import software.aws.toolkits.resources.message

class DeleteObjectAction(
    private var treeTable: S3TreeTable,
    val bucket: S3VirtualBucket
) : ActionButtonWrapper(message("s3.delete.object.action"), null, AllIcons.Actions.Cancel) {

    @Suppress("unused")
    override fun doActionPerformed(e: AnActionEvent) {
        val project = e.getRequiredData(LangDataKeys.PROJECT)
        val client: S3Client = AwsClientManager.getInstance(project).getClient()
        val rows = treeTable.selectedRows.toList()
        val objectsToDelete = mutableListOf<ObjectIdentifier>()

        for (row in rows) {
            val key = treeTable.getNodeForRow(row)?.key ?: continue
            objectsToDelete.add(ObjectIdentifier.builder().key(key).build())
        }

        val response = Messages.showOkCancelDialog(
            project,
            message("s3.delete.object.description", rows.size),
            message("s3.delete.object.action"),
            message("s3.delete.object.delete"),
            message("s3.delete.object.cancel"), Messages.getWarningIcon()
        )

        if (response == Messages.OK) {
            ApplicationManager.getApplication().executeOnPooledThread {
                try {
                    deleteObjectAction(client, objectsToDelete)
                    treeTable.removeRows(rows)
                    treeTable.refresh()
                } catch (e: Exception) {
                    notifyInfo(message("s3.delete.object.failed"))
                }
            }
        }
    }

    override fun isEnabled(): Boolean = (!(treeTable.isEmpty || (treeTable.selectedRow < 0) || (treeTable.getValueAt(treeTable.selectedRow, 1) == "")))

    fun deleteObjectAction(client: S3Client, objectsToDelete: MutableList<ObjectIdentifier>) {
        val bucketName = bucket.name
        val deleteObjectsRequest = DeleteObjectsRequest.builder()
            .bucket(bucketName)
            .delete(Delete.builder().objects(objectsToDelete).build())
            .build()
        client.deleteObjects(deleteObjectsRequest)
    }
}
