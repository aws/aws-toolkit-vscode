// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3.editor

import com.intellij.ui.ColoredTreeCellRenderer
import com.intellij.ui.LoadingNode
import com.intellij.ui.SimpleTextAttributes
import com.intellij.ui.speedSearch.SpeedSearchUtil
import javax.swing.JComponent
import javax.swing.JTree
import javax.swing.tree.DefaultMutableTreeNode

class S3TreeCellRenderer(private val speedSearchTarget: JComponent) : ColoredTreeCellRenderer() {
    init {
        myUsedCustomSpeedSearchHighlighting = true
    }

    override fun customizeCellRenderer(tree: JTree, value: Any?, selected: Boolean, expanded: Boolean, leaf: Boolean, row: Int, hasFocus: Boolean) {
        if (value is LoadingNode) {
            append(LoadingNode.getText())
            return
        }

        val selectedNode = value as? DefaultMutableTreeNode
        val node = selectedNode?.userObject as? S3TreeNode ?: return

        icon = node.icon
        when (node) {
            is S3TreeContinuationNode<*> -> {
                append(node.displayName(), SimpleTextAttributes.LINK_ATTRIBUTES)
            }
            else -> {
                append(node.displayName())
            }
        }

        SpeedSearchUtil.applySpeedSearchHighlighting(speedSearchTarget, this, true, selected)
    }

    override fun calcFocusedState(): Boolean = speedSearchTarget.hasFocus()
}
