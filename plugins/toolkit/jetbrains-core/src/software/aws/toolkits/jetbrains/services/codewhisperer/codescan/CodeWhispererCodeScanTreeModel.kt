// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.codescan

import javax.swing.tree.DefaultMutableTreeNode
import javax.swing.tree.DefaultTreeModel

internal class CodeWhispererCodeScanTreeModel(
    private val codeScanTreeNodeRoot: DefaultMutableTreeNode = DefaultMutableTreeNode("CodeWhisperer security scan results")
) : DefaultTreeModel(codeScanTreeNodeRoot) {

    override fun getRoot(): Any = codeScanTreeNodeRoot

    override fun getChild(parent: Any?, index: Int): Any {
        parent as DefaultMutableTreeNode
        return synchronized(parent) { parent.getChildAt(index) }
    }

    override fun getChildCount(parent: Any?): Int {
        parent as DefaultMutableTreeNode
        return synchronized(parent) { parent.childCount }
    }

    override fun isLeaf(node: Any?): Boolean {
        node as DefaultMutableTreeNode
        return synchronized(node) { node.isLeaf }
    }

    override fun getIndexOfChild(parent: Any?, child: Any?): Int {
        parent as DefaultMutableTreeNode
        child as DefaultMutableTreeNode
        return synchronized(parent) { parent.getIndex(child) }
    }

    fun getTotalIssuesCount(): Int = synchronized(codeScanTreeNodeRoot) {
        codeScanTreeNodeRoot.children().asSequence().sumBy { it.childCount }
    }
}
