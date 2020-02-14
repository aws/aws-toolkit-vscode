// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.InputValidator
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

class RenameObjectAction(private val project: Project, treeTable: S3TreeTable) : SingleS3ObjectAction(treeTable, message("s3.rename.object.action")) {

    override fun enabled(node: S3TreeNode): Boolean = node is S3TreeObjectNode

    override fun performAction(node: S3TreeNode) {

        val newName = Messages.showInputDialog(
            project,
            message("s3.rename.object.title", node.name),
            message("s3.rename.object.action"),
            null,
            node.name,
            object : InputValidator {
                override fun checkInput(inputString: String?): Boolean = true

                override fun canClose(inputString: String?): Boolean = checkInput(inputString)
            }
        )
        if (newName == null) {
            S3Telemetry.renameObject(project, Result.CANCELLED)
        } else {
            GlobalScope.launch {
                try {
                    treeTable.bucket.renameObject(node.key, "${node.parent?.key}$newName")
                    treeTable.invalidateLevel(node)
                    treeTable.refresh()
                    S3Telemetry.renameObject(project, Result.SUCCEEDED)
                } catch (e: Exception) {
                    e.notifyError(message("s3.rename.object.failed"))
                    S3Telemetry.renameObject(project, Result.FAILED)
                }
            }
        }
    }
}
