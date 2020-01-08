// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeDirectoryNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeTable
import software.aws.toolkits.jetbrains.services.s3.editor.getDirectoryKey
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message

class NewFolderAction(private val project: Project, treeTable: S3TreeTable) : SingleS3ObjectAction(treeTable, message("s3.new.folder")) {
    override fun performAction(node: S3TreeNode) {
        Messages.showInputDialog(project, message("s3.new.folder.name"), message("s3.new.folder"), null)?.let { key ->
            GlobalScope.launch {
                try {
                    treeTable.bucket.newFolder(node.getDirectoryKey() + key)
                    treeTable.invalidateLevel(node)
                    treeTable.refresh()
                } catch (e: Exception) {
                    e.notifyError()
                }
            }
        }
    }

    override fun enabled(node: S3TreeNode): Boolean = node is S3TreeDirectoryNode
}
