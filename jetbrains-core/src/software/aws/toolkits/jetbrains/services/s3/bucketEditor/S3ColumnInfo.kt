// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3.bucketEditor

import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.treeStructure.treetable.TreeTableModel
import com.intellij.util.ui.ColumnInfo
import software.aws.toolkits.jetbrains.services.s3.S3VirtualDirectory
import software.aws.toolkits.jetbrains.services.s3.S3VirtualObject
import software.aws.toolkits.resources.message
import javax.swing.tree.DefaultMutableTreeNode

open class S3ColumnInfo(columnTitle: String, val valueGetter: (S3VirtualObject) -> String?) :
    ColumnInfo<Any, String>(columnTitle) {

    override fun valueOf(obj: Any): String? =
        when (val file = getVirtualFileFromNode(obj)) {
            is S3VirtualObject -> valueGetter.invoke(file)
            else -> ""
        }

    override fun isCellEditable(item: Any?): Boolean = true

    fun getVirtualFileFromNode(obj: Any): VirtualFile? {
        val userObject = (obj as? DefaultMutableTreeNode)?.userObject
        return (userObject as? S3KeyNode)?.virtualFile
    }
}

class S3KeyColumnInfo(valueGetter: (S3VirtualObject) -> String?) :
    S3ColumnInfo(message("s3.name"), valueGetter) {

    override fun valueOf(obj: Any): String? {
        val file = super.getVirtualFileFromNode(obj)
        return when (file) {
            is S3VirtualObject -> valueGetter.invoke(file)
            is S3VirtualDirectory -> file.name
            else -> ""
        }
    }

    override fun getColumnClass(): Class<*> = TreeTableModel::class.java
}
