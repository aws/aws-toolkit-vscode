// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.nodes

import com.intellij.ide.projectView.PresentationData
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.application.ApplicationManager
import com.intellij.ui.LoadingNode
import com.intellij.ui.SimpleTextAttributes
import software.aws.toolkits.resources.message
import javax.swing.tree.DefaultMutableTreeNode
import javax.swing.tree.DefaultTreeModel
import javax.swing.tree.MutableTreeNode

/**
 * An [AwsExplorerNode] that is added in when the results from a service are paginated and we reached the end of a page.
 * This node handles showing a message that the results were truncated. Double clicking on the node will load in the
 * next page of results asynchronously.
 *
 * @see AwsExplorerPageableNode
 * @see AwsExplorerLoadingNode
 * TODO: We have received feedback of people not liking having to click to load more, we should re-visit this
 */
class AwsTruncatedResultNode(private val parentNode: AwsExplorerPageableNode<*>, private val paginationToken: String) :
    AwsExplorerNode<String>(parentNode.project!!, MESSAGE, null) {

    override fun getChildren(): Collection<AbstractTreeNode<Any>> = emptyList()

    override fun update(presentation: PresentationData) {
        presentation.addText(value, SimpleTextAttributes.GRAYED_ATTRIBUTES)
    }

    override fun onDoubleClick(model: DefaultTreeModel, selectedElement: DefaultMutableTreeNode) {
        // The Tree is represented by two systems. The entire tree (AbstractTreeNode) and the subsection
        // of the tree that is visible (MutableTreeNode). We have to update both systems if we wish to show the
        // data correctly, else we will lose data either when nodes are collapsed/expanded again, or the tree UI does
        // not show the new data. Tree Node will refer to nodes of type AbstractTreeNode, UI node will refer to
        // MutableTreeNode

        // Remove the truncated node from the Tree Node and add our fake loading node so that if they collapse and
        // expand quick enough it'll stay in loading mode
        val children = parentNode.children
        children.asReversed().removeIf { it is AwsTruncatedResultNode }
        children.add(AwsExplorerLoadingNode(project!!))

        // Update the UI version to remove the truncation node and add loading
        val parent = selectedElement.parent as DefaultMutableTreeNode
        model.removeNodeFromParent(selectedElement)
        val loadingNode = LoadingNode()
        model.insertNodeInto(loadingNode, parent, parent.childCount)

        ApplicationManager.getApplication().executeOnPooledThread {
            val nextSetOfResources = parentNode.loadData(paginationToken)

            // Run next steps on the EDT thread
            ApplicationManager.getApplication().invokeLater {
                // If the parent UI node is gone, we re-collapsed so no reason to remove it
                val parentTreeNode = loadingNode.parent as? MutableTreeNode
                if (parentTreeNode != null) {
                    model.removeNodeFromParent(loadingNode)
                }

                // Remove our fake loading node from Tree Node
                children.removeIf {
                    it is AwsExplorerLoadingNode
                }

                nextSetOfResources.forEach {
                    // This call is usually handled by the Tree infrastructure, but we are doing pagination manually
                    // so we also need to update the presentation data manually else it will render without the
                    // proper text
                    it.update()
                    children.add(it)

                    if (parentTreeNode != null) {
                        model.insertNodeInto(DefaultMutableTreeNode(it), parentTreeNode, parentTreeNode.childCount)
                    }
                }
            }
        }
    }

    override fun isAlwaysLeaf() = true

    companion object {
        private val MESSAGE get() = message("explorer.results_truncated")
    }
}