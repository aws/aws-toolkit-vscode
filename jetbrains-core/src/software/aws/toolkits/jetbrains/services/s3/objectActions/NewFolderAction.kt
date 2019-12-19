// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.ui.Messages
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch
import software.aws.toolkits.jetbrains.components.telemetry.ActionButtonWrapper
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeTable
import software.aws.toolkits.jetbrains.services.s3.editor.getDirectoryKey
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message

class NewFolderAction(private val treeTable: S3TreeTable) : ActionButtonWrapper(message("s3.new.folder"), null, null) {

    override fun isEnabled(): Boolean = treeTable.selectedRows.size <= 1

    override fun doActionPerformed(e: AnActionEvent) {

        val node = treeTable.selectedRows.firstOrNull()?.let { treeTable.getNodeForRow(it) } ?: treeTable.getRootNode()

        Messages.showInputDialog(e.project, message("s3.new.folder.name"), message("s3.new.folder"), null)?.let { key ->
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

    companion object {
        private const val TELEMETRY_NAME = "s3_newfolder"
    }
}
