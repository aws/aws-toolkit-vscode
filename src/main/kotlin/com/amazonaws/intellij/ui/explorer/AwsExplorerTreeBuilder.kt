package com.amazonaws.intellij.ui.explorer

import com.intellij.ide.util.treeView.AbstractTreeBuilder
import com.intellij.ide.util.treeView.NodeDescriptor
import com.intellij.openapi.project.Project
import javax.swing.JTree
import javax.swing.tree.DefaultTreeModel

/**
 * Created by zhaoxiz on 7/27/17.
 */

class AwsExplorerTreeBuilder(tree: JTree, treeModel: DefaultTreeModel, private val project: Project, private val region: String):
        AbstractTreeBuilder(tree, treeModel, AwsExplorerTreeStructure(project, region), null, false) {

    init {
        initRootNode()
    }

    override fun isAlwaysShowPlus(descriptor: NodeDescriptor<*>?) = descriptor is AwsExplorerServiceRootNode<*>
}
