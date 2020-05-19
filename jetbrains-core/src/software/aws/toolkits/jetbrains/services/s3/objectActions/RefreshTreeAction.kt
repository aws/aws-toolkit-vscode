// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.icons.AllIcons
import com.intellij.ide.util.treeView.TreeState
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAware
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeDirectoryNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeTable
import software.aws.toolkits.resources.message

class RefreshTreeAction(
    private val treeTable: S3TreeTable,
    private val rootNode: S3TreeDirectoryNode
) : AnAction(message("general.refresh"), null, AllIcons.Actions.Refresh), DumbAware {
    override fun actionPerformed(e: AnActionEvent) {
        val state = TreeState.createOn(treeTable.tree)
        rootNode.removeAllChildren()
        treeTable.refresh()
        state.applyTo(treeTable.tree)
    }
}
