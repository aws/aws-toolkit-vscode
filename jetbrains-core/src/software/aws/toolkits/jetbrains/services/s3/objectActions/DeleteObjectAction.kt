// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import kotlinx.coroutines.launch
import software.amazon.awssdk.services.s3.model.NoSuchBucketException
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.core.utils.getRequiredData
import software.aws.toolkits.jetbrains.services.s3.editor.S3EditorDataKeys
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeObjectNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeTable
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.Result
import software.aws.toolkits.telemetry.S3Telemetry

class DeleteObjectAction : S3ObjectAction(message("s3.delete.object.action"), AllIcons.Actions.Cancel) {
    override fun performAction(dataContext: DataContext, nodes: List<S3TreeNode>) {
        val project = dataContext.getRequiredData(CommonDataKeys.PROJECT)
        val treeTable = dataContext.getRequiredData(S3EditorDataKeys.BUCKET_TABLE)
        deleteNodes(project, treeTable, nodes.filterIsInstance<S3TreeObjectNode>())
    }

    // TODO enable for versioned objects.
    override fun enabled(nodes: List<S3TreeNode>): Boolean = nodes.isNotEmpty() && nodes.all { it::class == S3TreeObjectNode::class }

    private fun deleteNodes(project: Project, treeTable: S3TreeTable, nodes: List<S3TreeObjectNode>) {
        val response = Messages.showOkCancelDialog(
            project,
            message("s3.delete.object.description", nodes.size),
            message("s3.delete.object.action"),
            message("general.delete"),
            message("s3.delete.object.cancel"),
            Messages.getWarningIcon()
        )

        if (response != Messages.OK) {
            S3Telemetry.deleteObject(project, Result.Cancelled)
        } else {
            val scope = projectCoroutineScope(project)
            scope.launch {
                try {
                    treeTable.bucket.deleteObjects(nodes.map { it.key })
                    nodes.forEach { treeTable.invalidateLevel(it) }
                    treeTable.refresh()
                    S3Telemetry.deleteObject(project, Result.Succeeded)
                } catch (e: NoSuchBucketException) {
                    treeTable.bucket.handleDeletedBucket()
                    S3Telemetry.deleteObject(project, Result.Failed)
                } catch (e: Exception) {
                    e.notifyError(project = project, title = message("s3.delete.object.failed"))
                    S3Telemetry.deleteObject(project, Result.Failed)
                }
            }
        }
    }
}
