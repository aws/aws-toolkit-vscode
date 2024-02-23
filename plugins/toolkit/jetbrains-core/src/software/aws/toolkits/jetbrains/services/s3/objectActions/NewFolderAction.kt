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
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeDirectoryNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeObjectNode
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.Result
import software.aws.toolkits.telemetry.S3Telemetry

class NewFolderAction : S3ObjectAction(message("s3.new.folder"), AllIcons.Actions.NewFolder) {
    override fun performAction(dataContext: DataContext, nodes: List<S3TreeNode>) {
        val project = dataContext.getRequiredData(CommonDataKeys.PROJECT)
        val treeTable = dataContext.getRequiredData(S3EditorDataKeys.BUCKET_TABLE)
        val node = nodes.firstOrNull() ?: treeTable.rootNode
        val scope = projectCoroutineScope(project)

        Messages.showInputDialog(project, message("s3.new.folder.name"), message("s3.new.folder"), null)?.let { key ->
            scope.launch {
                var result = Result.Failed
                try {
                    node.bucket.newFolder(node.directoryPath() + key)
                    treeTable.invalidateLevel(node)
                    treeTable.refresh()
                    result = Result.Succeeded
                } catch (e: NoSuchBucketException) {
                    node.bucket.handleDeletedBucket()
                } catch (e: Exception) {
                    e.notifyError(project = project)
                } finally {
                    S3Telemetry.createFolder(project, result)
                }
            }
        } ?: S3Telemetry.createFolder(project, Result.Cancelled)
    }

    override fun enabled(nodes: List<S3TreeNode>): Boolean = nodes.isEmpty() ||
        (nodes.size == 1 && nodes.first().let { it is S3TreeObjectNode || it is S3TreeDirectoryNode })
}
