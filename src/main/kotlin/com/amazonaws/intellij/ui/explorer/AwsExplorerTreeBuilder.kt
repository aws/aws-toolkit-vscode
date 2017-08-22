package com.amazonaws.intellij.ui.explorer

import com.intellij.ide.util.treeView.AbstractTreeBuilder
import com.intellij.ide.util.treeView.NodeDescriptor
import com.intellij.openapi.project.Project
import javax.swing.JTree
import javax.swing.tree.DefaultTreeModel

class AwsExplorerTreeBuilder(tree: JTree, treeModel: DefaultTreeModel, project: Project, profile: String, region: String):
        AbstractTreeBuilder(tree, treeModel, AwsExplorerTreeStructure(project, profile, region), null, false) {

    init {
        initRootNode()
    }

    override fun isAlwaysShowPlus(descriptor: NodeDescriptor<*>?) = descriptor is AwsExplorerServiceRootNode<*>
}
