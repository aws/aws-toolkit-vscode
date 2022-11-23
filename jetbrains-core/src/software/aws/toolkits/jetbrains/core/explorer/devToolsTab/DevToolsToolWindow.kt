// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer.devToolsTab

import com.intellij.ide.util.treeView.NodeDescriptor
import com.intellij.ide.util.treeView.NodeRenderer
import com.intellij.ide.util.treeView.TreeState
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionGroup
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.SimpleToolWindowPanel
import com.intellij.ui.DoubleClickListener
import com.intellij.ui.PopupHandler
import com.intellij.ui.ScrollPaneFactory
import com.intellij.ui.TreeUIHelper
import com.intellij.ui.tree.AsyncTreeModel
import com.intellij.ui.tree.StructureTreeModel
import com.intellij.ui.treeStructure.Tree
import com.intellij.util.concurrency.Invoker
import com.intellij.util.ui.UIUtil
import com.intellij.util.ui.tree.TreeUtil
import software.aws.toolkits.jetbrains.ToolkitPlaces
import software.aws.toolkits.jetbrains.core.explorer.devToolsTab.nodes.AbstractActionTreeNode
import software.aws.toolkits.jetbrains.core.explorer.devToolsTab.nodes.ActionGroupOnRightClick
import java.awt.Component
import java.awt.event.MouseEvent
import javax.swing.JTree
import javax.swing.tree.DefaultMutableTreeNode

class DevToolsToolWindow(private val project: Project) : SimpleToolWindowPanel(true, true), Disposable {
    private val treeModel = StructureTreeModel(DevToolsTreeStructure(project), null, Invoker.forBackgroundPoolWithReadAction(this), this)
    private val tree = Tree(AsyncTreeModel(treeModel, true, this))

    init {
        background = UIUtil.getTreeBackground()

        TreeUIHelper.getInstance().installTreeSpeedSearch(tree)
        tree.isRootVisible = false
        tree.autoscrolls = true
        tree.cellRenderer = object : NodeRenderer() {
            override fun customizeCellRenderer(tree: JTree, value: Any?, selected: Boolean, expanded: Boolean, leaf: Boolean, row: Int, hasFocus: Boolean) {
                super.customizeCellRenderer(tree, value, selected, expanded, leaf, row, hasFocus)
                if (value is DefaultMutableTreeNode && value.userObject is NodeDescriptor<*>) {
                    icon = (value.userObject as NodeDescriptor<*>).icon
                }
            }
        }

        object : DoubleClickListener() {
            override fun onDoubleClick(event: MouseEvent): Boolean {
                val path = tree.getPathForLocation(event.x, event.y)
                ((path?.lastPathComponent as? DefaultMutableTreeNode)?.userObject as? AbstractActionTreeNode)?.onDoubleClick()
                return true
            }
        }.installOn(tree)

        tree.addMouseListener(
            object : PopupHandler() {
                override fun invokePopup(comp: Component?, x: Int, y: Int) {
                    val actionNode = getSelectedNodesSameType<AbstractActionTreeNode>()?.get(0) ?: return
                    if (actionNode is ActionGroupOnRightClick) {
                        val actionManager = ActionManager.getInstance()
                        val actionGroupName = actionNode.actionGroupName()

                        val totalActions = mutableListOf<AnAction>()

                        (actionGroupName.let { groupName -> actionManager.getAction(groupName) } as? ActionGroup)?.let {
                            totalActions.addAll(it.getChildren(null))
                        }

                        val actionGroup = DefaultActionGroup(totalActions)
                        if (actionGroup.childrenCount > 0) {
                            val popupMenu = actionManager.createActionPopupMenu(ToolkitPlaces.DEV_TOOL_WINDOW, actionGroup)
                            popupMenu.component.show(comp, x, y)
                        }
                    }
                }
            }
        )

        setContent(ScrollPaneFactory.createScrollPane(tree))

        TreeUtil.expand(tree, 2)
    }

    override fun dispose() {}

    private inline fun <reified T : AbstractActionTreeNode> getSelectedNodesSameType(): List<T>? {
        val selectedNodes = getSelectedNodes<T>()
        if (selectedNodes.isEmpty()) {
            return null
        }

        val firstClass = selectedNodes[0]::class.java
        return if (selectedNodes.all { firstClass.isInstance(it) }) {
            selectedNodes
        } else {
            null
        }
    }

    private inline fun <reified T : AbstractActionTreeNode> getSelectedNodes() = tree.selectionPaths?.let { treePaths ->
        treePaths.map { it.lastPathComponent }
            .filterIsInstance<DefaultMutableTreeNode>()
            .map { it.userObject }
            .filterIsInstance<T>()
            .toList()
    } ?: emptyList<T>()

    fun redrawTree() {
        // required for refresh
        val state = TreeState.createOn(tree)
        treeModel.invalidate()
        state.applyTo(tree)
    }

    companion object {
        fun getInstance(project: Project) = project.service<DevToolsToolWindow>()
    }
}
