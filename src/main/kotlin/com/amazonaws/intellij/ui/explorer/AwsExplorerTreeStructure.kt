package com.amazonaws.intellij.ui.explorer

import com.intellij.ide.projectView.TreeStructureProvider
import com.intellij.ide.util.treeView.AbstractTreeStructureBase
import com.intellij.openapi.project.Project

class AwsExplorerTreeStructure(project: Project, val region: String) : AbstractTreeStructureBase(project) {

    override fun getProviders(): List<TreeStructureProvider>? {
        return emptyList()
    }

    override fun getRootElement(): AwsExplorerRootNode {
        return AwsExplorerRootNode(myProject, region)
    }

    override fun commit() {
    }

    override fun hasSomethingToCommit(): Boolean {
        return false
    }

    override fun isToBuildChildrenInBackground(element: Any?): Boolean {
        return true
    }
}
