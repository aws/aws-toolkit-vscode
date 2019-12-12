// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3.editor

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.ui.treeStructure.treetable.TreeTable
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.swing.tree.DefaultMutableTreeNode

open class S3TreeTable(private val treeTableModel: S3TreeTableModel) : TreeTable(treeTableModel) {
    fun refresh() {
        runInEdt {
            clearSelection()
            treeTableModel.structureTreeModel.invalidate()
        }
    }

    private val mouseListener = object : MouseAdapter() {
        override fun mouseClicked(e: MouseEvent) {
            val row = rowAtPoint(e.point)
            if (row < 0) {
                return
            }
            handleLoadingMore(row, e)
        }
    }

    private fun handleLoadingMore(row: Int, e: MouseEvent) {
        if (e.clickCount != 2) {
            return
        }
        val continuationNode = (tree.getPathForRow(row).lastPathComponent as? DefaultMutableTreeNode)?.userObject as? S3TreeContinuationNode ?: return
        val parent = continuationNode.parent ?: return

        ApplicationManager.getApplication().executeOnPooledThread {
            parent.loadMore(continuationNode.token)
            refresh()
        }
    }

    init {
        super.addMouseListener(mouseListener)
    }

    fun getNodeForRow(row: Int): S3TreeNode? {
        val path = tree.getPathForRow(convertRowIndexToModel(row))
        return (path.lastPathComponent as DefaultMutableTreeNode).userObject as? S3TreeNode
    }

    fun getSelectedNodes(): List<S3TreeNode> = selectedRows.map { getNodeForRow(it) }.filterNotNull()

    fun removeRows(rows: List<Int>) =
        runInEdt {
            rows.map {
                val path = tree.getPathForRow(it)
                path.lastPathComponent as DefaultMutableTreeNode
            }.forEach {
                val userNode = it.userObject as? S3TreeNode ?: return@forEach
                ((it.parent as? DefaultMutableTreeNode)?.userObject as? S3TreeDirectoryNode)?.removeChild(userNode)
            }
        }

    fun invalidateLevel(node: S3TreeNode) {
        node.parent?.removeAllChildren()
    }
}
