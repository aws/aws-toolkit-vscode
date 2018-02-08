package software.aws.toolkits.jetbrains.core.explorer

import com.intellij.ide.projectView.TreeStructureProvider
import com.intellij.ide.util.treeView.AbstractTreeStructureBase
import com.intellij.openapi.project.Project

class AwsExplorerTreeStructure(project: Project) : AbstractTreeStructureBase(project) {

    override fun getProviders(): List<TreeStructureProvider>? = emptyList()

    override fun getRootElement() = AwsExplorerRootNode(myProject)

    override fun commit() {}

    override fun hasSomethingToCommit() = false

    override fun isToBuildChildrenInBackground(element: Any?) = true
}
