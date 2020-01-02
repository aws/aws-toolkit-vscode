// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
// Copyright 2000-2019 JetBrains s.r.o. Use of this source code is governed by the Apache 2.0 license that can be found in the LICENSE file.
package software.aws.toolkits.jetbrains.services.s3.editor

import com.intellij.ui.tree.TreeVisitor
import com.intellij.ui.treeStructure.SimpleTreeStructure
import com.intellij.ui.treeStructure.treetable.TreeTableModel
import com.intellij.util.ui.ColumnInfo
import org.jetbrains.concurrency.Promise
import software.aws.toolkits.jetbrains.ui.tree.AsyncTreeModel
import software.aws.toolkits.jetbrains.ui.tree.StructureTreeModel
import javax.swing.JTree
import javax.swing.tree.TreeModel
import javax.swing.tree.TreePath

/**
 * Fork of JetBrain's intellij-community TreeTableModelWithColumns allowing us to use a custom AsyncTreeModel
 * The only changes to this from original version are changing of imports and name of model
 */
class S3TreeTableModel(
    private val delegate: AsyncTreeModel,
    private val columns: Array<ColumnInfo<Any?, Any?>>,
    val structureTreeModel: StructureTreeModel<SimpleTreeStructure>
) : TreeTableModel, TreeModel by delegate, TreeVisitor.Acceptor {

    override fun getColumnCount(): Int = columns.size

    override fun getColumnName(column: Int): String = columns[column].name

    override fun getColumnClass(column: Int): Class<*> = columns[column].columnClass

    override fun getValueAt(node: Any?, column: Int): Any? = columns[column].valueOf(node)

    override fun setValueAt(aValue: Any?, node: Any?, column: Int) = columns[column].setValue(node, aValue)

    override fun isCellEditable(node: Any?, column: Int): Boolean = columns[column].isCellEditable(node)

    override fun setTree(tree: JTree?) {}

    override fun accept(visitor: TreeVisitor): Promise<TreePath> = delegate.accept(visitor)
}
