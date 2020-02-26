// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.cloudformation.stack

import com.intellij.ide.util.treeView.NodeDescriptor
import com.intellij.openapi.Disposable
import com.intellij.openapi.project.Project
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.treeStructure.Tree
import one.util.streamex.StreamEx
import software.amazon.awssdk.services.cloudformation.model.StackResource
import software.amazon.awssdk.services.cloudformation.model.StackStatus
import software.aws.toolkits.resources.message
import javax.swing.Icon
import javax.swing.JComponent
import javax.swing.tree.DefaultMutableTreeNode
import javax.swing.tree.DefaultTreeModel
import javax.swing.tree.MutableTreeNode

/**
 *
 * Stack status tree
 * [component] with tree content
 */
interface TreeView : View {
    /**
     * Update list of resources
     */
    fun fillResources(resources: Collection<StackResource>)

    /**
     * Sets whole stack status.
     */
    fun setStackStatus(status: StackStatus)
}

internal class TreeViewImpl(private val project: Project, stackName: String) : TreeView, Disposable, ViewWithIcons {

    private val tree: Tree
    override val component: JComponent

    private val rootNode: DefaultMutableTreeNode
        get() = tree.model.root as DefaultMutableTreeNode

    private val rootDescriptor: StackNodeDescriptor
        get() = rootNode.userObject as StackNodeDescriptor

    private var model: DefaultTreeModel

    /**
     * Remove outdated nodes, add new nodes, update status
     */
    private fun updateResourceList(resources: Collection<StackResource>) {

        val resourcesByName = resources.map { it.logicalResourceId() to it }.toMap()
        val existingResources = mutableSetOf<String>()
        val nodesToDelete = mutableListOf<MutableTreeNode>()

        for (rawNode in rootNode.children()) {
            val node = rawNode as DefaultMutableTreeNode
            val descriptor = (node.userObject as StackNodeDescriptor)
            val name = descriptor.element
            val resource = resourcesByName[name]
            if (resource != null) {
                // Set status
                val status = resource.resourceStatus()
                descriptor.setStatusAndType(status.type, status.name)
                descriptor.update()
                existingResources.add(name)
            } else {
                nodesToDelete.add(node)
            }
        }
        nodesToDelete.forEach { rootNode.remove(it) }
        for (nameAndResource in resourcesByName) {
            val name = nameAndResource.key
            if (name in existingResources) {
                continue
            }
            val resource = nameAndResource.value

            val status = resource.resourceStatus()
            val newDescriptor = StackNodeDescriptor(project, name, status.type, status.name, rootDescriptor)
            rootNode.add(DefaultMutableTreeNode(newDescriptor, false))
        }
    }

    init {
        val descriptor = StackNodeDescriptor(project, stackName, StatusType.UNKNOWN, message("loading_resource.loading"))
        val rootNode = DefaultMutableTreeNode(descriptor, true)
        model = DefaultTreeModel(rootNode)
        tree = Tree(model)
        tree.setPaintBusy(true)
        component = JBScrollPane(tree)
    }

    override fun getIconsAndUpdaters() =
        (StreamEx.of(rootNode.children()) + listOf(rootNode))
            .filterIsInstance<DefaultMutableTreeNode>()
            .map { resourceNode -> IconInfo(resourceNode.icon) { model.reload(resourceNode) } }

    private val DefaultMutableTreeNode.icon: Icon
        get() = (userObject as StackNodeDescriptor).icon!!

    override fun fillResources(resources: Collection<StackResource>) {
        tree.setPaintBusy(false)
        updateResourceList(resources)
        tree.expandRow(0) // Collapsed tree here makes no sense
        tree.updateUI()
    }

    override fun setStackStatus(status: StackStatus) {
        rootDescriptor.setStatusAndType(status.type, status.name)
    }

    override fun dispose() {
    }
}

private class StackNodeDescriptor(
    project: Project,
    name: String,
    private var statusType: StatusType,
    private var status: String,
    parent: StackNodeDescriptor? = null
) : NodeDescriptor<String>(project, parent) {

    init {
        myName = name
        update()
    }

    fun setStatusAndType(statusType: StatusType, status: String) {
        this.status = status
        this.statusType = statusType
        update()
    }

    override fun update(): Boolean {
        val iconForStatus = statusType.animatedIconIfPossible
        val result = iconForStatus == icon
        icon = iconForStatus
        return result
    }

    override fun getElement() = myName!!
    override fun toString() = "$myName [$status]"
}
