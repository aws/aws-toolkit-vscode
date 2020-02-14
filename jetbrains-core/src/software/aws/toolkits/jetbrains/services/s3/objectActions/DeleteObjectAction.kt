// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.icons.AllIcons
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeObjectNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeTable
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.Result
import software.aws.toolkits.telemetry.S3Telemetry

class DeleteObjectAction(private val project: Project, treeTable: S3TreeTable) :
    S3ObjectAction(treeTable, message("s3.delete.object.action"), AllIcons.Actions.Cancel) {

    override fun performAction(nodes: List<S3TreeNode>) {
        deleteNodes(project, treeTable, nodes.filterIsInstance<S3TreeObjectNode>())
    }

    override fun enabled(nodes: List<S3TreeNode>): Boolean = nodes.all { it is S3TreeObjectNode }
}

fun deleteSelectedObjects(project: Project, treeTable: S3TreeTable) {
    val nodes = treeTable.getSelectedNodes().filterIsInstance<S3TreeObjectNode>()
    deleteNodes(project, treeTable, nodes)
}

private fun deleteNodes(project: Project, treeTable: S3TreeTable, nodes: List<S3TreeObjectNode>) {
    val response = Messages.showOkCancelDialog(
        project,
        message("s3.delete.object.description", nodes.size),
        message("s3.delete.object.action"),
        message("s3.delete.object.delete"),
        message("s3.delete.object.cancel"), Messages.getWarningIcon()
    )

    if (response != Messages.OK) {
        S3Telemetry.deleteObject(project, Result.CANCELLED)
    } else {
        GlobalScope.launch {
            try {
                treeTable.bucket.deleteObjects(nodes.map { it.key })
                nodes.forEach { treeTable.invalidateLevel(it) }
                treeTable.refresh()
                S3Telemetry.deleteObject(project, Result.SUCCEEDED)
            } catch (e: Exception) {
                e.notifyError(message("s3.delete.object.failed"))
                S3Telemetry.deleteObject(project, Result.FAILED)
            }
        }
    }
}
