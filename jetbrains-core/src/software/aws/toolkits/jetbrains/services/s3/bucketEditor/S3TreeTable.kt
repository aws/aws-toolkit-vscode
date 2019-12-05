// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3.bucketEditor

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.treeStructure.treetable.TreeTable
import javax.swing.tree.DefaultMutableTreeNode

open class S3TreeTable(private val treeTableModel: S3TreeTableModel) : TreeTable(treeTableModel) {
    fun refresh() {
        runInEdt {
            clearSelection()
            val structureTreeModel = treeTableModel.structureTreeModel
            structureTreeModel.invalidate()
        }
    }

    fun getSelectedAsVirtualFiles(): List<VirtualFile> =
        selectedRows.map {
            val path = tree.getPathForRow(convertRowIndexToModel(it))
            val node = (path.lastPathComponent as DefaultMutableTreeNode).userObject as S3KeyNode
            node.virtualFile
        }
}
