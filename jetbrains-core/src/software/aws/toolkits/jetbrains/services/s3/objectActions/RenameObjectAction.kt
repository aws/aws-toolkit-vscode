// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.ui.InputValidator
import com.intellij.openapi.ui.Messages
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.CopyObjectRequest
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest
import software.aws.toolkits.jetbrains.components.telemetry.ActionButtonWrapper
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.services.s3.S3VirtualBucket
import software.aws.toolkits.jetbrains.services.s3.bucketEditor.S3TreeObjectNode
import software.aws.toolkits.jetbrains.services.s3.bucketEditor.S3TreeTable
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message

class RenameObjectAction(private var treeTable: S3TreeTable, val bucket: S3VirtualBucket) :
    ActionButtonWrapper(message("s3.rename.object.action"), null, null) {

    @Suppress("unused")
    override fun doActionPerformed(e: AnActionEvent) {
        val project = e.getRequiredData(LangDataKeys.PROJECT)
        val client: S3Client = AwsClientManager.getInstance(project).getClient()
        val node = treeTable.getSelectedNodes().firstOrNull() as? S3TreeObjectNode ?: return

        val response = Messages.showInputDialog(project,
            message("s3.rename.object.title", node.name),
            message("s3.rename.object.action"),
            null,
            node.name,
            object : InputValidator {
                override fun checkInput(inputString: String?): Boolean = true

                override fun canClose(inputString: String?): Boolean = checkInput(inputString)
            }
        )
        if (response != null) {
            ApplicationManager.getApplication().executeOnPooledThread {
                try {
                    renameObjectAction(response, node, client)
                    treeTable.invalidateLevel(node)
                    treeTable.refresh()
                } catch (e: Exception) {
                    e.notifyError(message("s3.rename.object.failed"))
                }
            }
        }
    }

    override fun isEnabled(): Boolean = !(treeTable.isEmpty || (treeTable.selectedRow < 0) ||
        (treeTable.getValueAt(treeTable.selectedRow, 1) == "") || (treeTable.selectedRows.size > 1))

    fun renameObjectAction(newName: String, file: S3TreeObjectNode, client: S3Client) {
        val bucketName = bucket.name
        val copyDestination = "${file.parent?.key}$newName"

        val copyObjectRequest: CopyObjectRequest = CopyObjectRequest.builder()
            .copySource("$bucketName/${file.key}")
            .bucket(bucketName)
            .key(copyDestination)
            .build()
        client.copyObject(copyObjectRequest)

        val deleteObjectRequest = DeleteObjectRequest.builder()
            .bucket(bucketName)
            .key(file.key)
            .build()
        client.deleteObject(deleteObjectRequest)
    }
}
