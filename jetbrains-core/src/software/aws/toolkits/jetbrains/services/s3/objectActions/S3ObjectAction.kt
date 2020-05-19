// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeContinuationNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeTable
import javax.swing.Icon

// TODO: The treeTable should be removed, and migrated to DataKey to decouple this from the treeTable
abstract class S3ObjectAction(protected val treeTable: S3TreeTable, title: String, icon: Icon? = null) : DumbAwareAction(title, null, icon) {
    protected abstract fun performAction(nodes: List<S3TreeNode>)

    protected open fun enabled(nodes: List<S3TreeNode>): Boolean = nodes.isNotEmpty()

    override fun update(e: AnActionEvent) {
        val selected = selected()
        e.presentation.isEnabled = selected.none { it is S3TreeContinuationNode } && enabled(selected)
    }

    override fun actionPerformed(e: AnActionEvent) = performAction(selected().filter { it !is S3TreeContinuationNode })

    private fun selected(): List<S3TreeNode> = treeTable.getSelectedNodes().takeIf { it.isNotEmpty() } ?: listOf(treeTable.rootNode)
}

abstract class SingleS3ObjectAction(treeTable: S3TreeTable, title: String, icon: Icon? = null) : S3ObjectAction(treeTable, title, icon) {

    final override fun performAction(nodes: List<S3TreeNode>) {
        if (nodes.size != 1) {
            throw IllegalStateException("SingleActionNode should only have a single node, got $nodes")
        }
        performAction(nodes.first())
    }

    final override fun enabled(nodes: List<S3TreeNode>): Boolean = nodes.size == 1 && enabled(nodes.first())

    protected abstract fun performAction(node: S3TreeNode)

    protected open fun enabled(node: S3TreeNode): Boolean = true
}
