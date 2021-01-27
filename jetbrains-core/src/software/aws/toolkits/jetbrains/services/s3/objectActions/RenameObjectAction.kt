// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.icons.AllIcons
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.InputValidator
import com.intellij.openapi.ui.Messages
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeObjectNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeTable
import software.aws.toolkits.jetbrains.utils.ApplicationThreadPoolScope
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.Result
import software.aws.toolkits.telemetry.S3Telemetry

class RenameObjectAction(
    private val project: Project,
    treeTable: S3TreeTable
) : SingleS3ObjectAction(treeTable, message("s3.rename.object.action"), AllIcons.Actions.RefactoringBulb),
    CoroutineScope by ApplicationThreadPoolScope("RenameObjectAction") {

    override fun enabled(node: S3TreeNode): Boolean = node::class == S3TreeObjectNode::class

    override fun performAction(node: S3TreeNode) {
        val newName = Messages.showInputDialog(
            project,
            message("s3.rename.object.title", node.displayName()),
            message("s3.rename.object.action"),
            null,
            node.displayName(),
            object : InputValidator {
                override fun checkInput(inputString: String?): Boolean = true

                override fun canClose(inputString: String?): Boolean = checkInput(inputString)
            }
        )
        if (newName == null) {
            S3Telemetry.renameObject(project, Result.Cancelled)
        } else {
            launch {
                try {
                    treeTable.bucket.renameObject(node.key, "${node.parent?.key}$newName")
                    treeTable.invalidateLevel(node)
                    treeTable.refresh()
                    S3Telemetry.renameObject(project, Result.Succeeded)
                } catch (e: Exception) {
                    e.notifyError(message("s3.rename.object.failed"))
                    S3Telemetry.renameObject(project, Result.Failed)
                }
            }
        }
    }
}
