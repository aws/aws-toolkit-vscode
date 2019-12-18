// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3

import com.intellij.ui.SimpleTextAttributes
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeContinuationNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeNode
import java.awt.Component
import javax.swing.JLabel
import javax.swing.JTree
import javax.swing.tree.DefaultMutableTreeNode
import javax.swing.tree.DefaultTreeCellRenderer

class S3TreeCellRenderer : DefaultTreeCellRenderer() {

    override fun getTreeCellRendererComponent(
        tree: JTree?,
        value: Any?,
        sel: Boolean,
        expanded: Boolean,
        leaf: Boolean,
        row: Int,
        hasFocus: Boolean
    ): Component {
        val component = super.getTreeCellRendererComponent(tree, value, sel, expanded, leaf, row, hasFocus) as JLabel
        val selected = value as? DefaultMutableTreeNode
        val node = selected?.userObject as? S3TreeNode
        component.icon = if (node?.isDirectory == true) {
            component.text = component.text.trimEnd('/')
            if (expanded) openIcon else closedIcon
        } else if (node is S3TreeContinuationNode) {
            component.foreground = SimpleTextAttributes.LINK_ATTRIBUTES.fgColor
            null
        } else {
            node?.icon ?: leafIcon
        }
        return component
    }
}
