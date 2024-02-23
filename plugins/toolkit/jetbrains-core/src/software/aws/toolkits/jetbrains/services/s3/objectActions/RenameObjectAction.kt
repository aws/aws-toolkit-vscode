// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.ui.Messages
import kotlinx.coroutines.launch
import software.amazon.awssdk.services.s3.model.NoSuchBucketException
import software.aws.toolkits.jetbrains.core.coroutines.projectCoroutineScope
import software.aws.toolkits.jetbrains.core.utils.getRequiredData
import software.aws.toolkits.jetbrains.services.s3.editor.S3EditorDataKeys
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeObjectNode
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.Result
import software.aws.toolkits.telemetry.S3Telemetry

class RenameObjectAction :
    SingleS3ObjectAction(message("s3.rename.object.action"), AllIcons.Actions.RefactoringBulb) {

    override fun performAction(dataContext: DataContext, node: S3TreeNode) {
        val project = dataContext.getRequiredData(CommonDataKeys.PROJECT)
        val treeTable = dataContext.getRequiredData(S3EditorDataKeys.BUCKET_TABLE)

        val newName = Messages.showInputDialog(
            project,
            message("s3.rename.object.title", node.displayName()),
            message("s3.rename.object.action"),
            null,
            node.displayName(),
            null
        )
        if (newName == null) {
            S3Telemetry.renameObject(project, Result.Cancelled)
        } else {
            val scope = projectCoroutineScope(project)
            scope.launch {
                try {
                    treeTable.bucket.renameObject(node.key, "${node.parent?.key}$newName")
                    treeTable.invalidateLevel(node)
                    treeTable.refresh()
                    S3Telemetry.renameObject(project, Result.Succeeded)
                } catch (e: NoSuchBucketException) {
                    treeTable.bucket.handleDeletedBucket()
                    S3Telemetry.renameObject(project, Result.Failed)
                } catch (e: Exception) {
                    e.notifyError(project = project, title = message("s3.rename.object.failed"))
                    S3Telemetry.renameObject(project, Result.Failed)
                }
            }
        }
    }

    override fun enabled(node: S3TreeNode): Boolean = node is S3TreeObjectNode
}
