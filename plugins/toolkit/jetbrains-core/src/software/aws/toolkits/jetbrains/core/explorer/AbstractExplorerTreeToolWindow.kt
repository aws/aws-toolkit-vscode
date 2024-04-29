// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer

import com.intellij.ide.ActivityTracker
import com.intellij.ide.DataManager
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.ide.util.treeView.AbstractTreeStructure
import com.intellij.ide.util.treeView.NodeDescriptor
import com.intellij.ide.util.treeView.NodeRenderer
import com.intellij.ide.util.treeView.TreeState
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionGroup
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DataKey
import com.intellij.openapi.actionSystem.DataProvider
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.ui.SimpleToolWindowPanel
import com.intellij.openapi.ui.asSequence
import com.intellij.openapi.ui.popup.Balloon
import com.intellij.ui.DoubleClickListener
import com.intellij.ui.GotItTooltip
import com.intellij.ui.PopupHandler
import com.intellij.ui.ScrollPaneFactory
import com.intellij.ui.TreeUIHelper
import com.intellij.ui.tree.AsyncTreeModel
import com.intellij.ui.tree.StructureTreeModel
import com.intellij.ui.treeStructure.Tree
import com.intellij.util.concurrency.Invoker
import com.intellij.util.ui.UIUtil
import com.intellij.util.ui.tree.TreeUtil
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManagerListener
import software.aws.toolkits.jetbrains.core.credentials.pinning.ConnectionPinningManagerListener
import software.aws.toolkits.jetbrains.core.credentials.pinning.FeatureWithPinnedConnection
import software.aws.toolkits.jetbrains.core.credentials.sso.bearer.BearerTokenProviderListener
import software.aws.toolkits.jetbrains.core.explorer.devToolsTab.nodes.AbstractActionTreeNode
import software.aws.toolkits.jetbrains.core.explorer.devToolsTab.nodes.ActionGroupOnRightClick
import software.aws.toolkits.jetbrains.core.explorer.devToolsTab.nodes.PinnedConnectionNode
import java.awt.Component
import java.awt.Point
import java.awt.event.MouseEvent
import javax.swing.JTree
import javax.swing.tree.DefaultMutableTreeNode
import javax.swing.tree.TreePath

abstract class AbstractExplorerTreeToolWindow(
    treeStructure: AbstractTreeStructure,
) : SimpleToolWindowPanel(true, true), DataProvider, Disposable {
    private val treeModel = StructureTreeModel(treeStructure, null, Invoker.forBackgroundPoolWithoutReadAction(this), this)
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
                ((path?.lastPathComponent as? DefaultMutableTreeNode)?.userObject as? AbstractActionTreeNode)?.onDoubleClick(event)
                return true
            }
        }.installOn(tree)

        tree.addMouseListener(
            object : PopupHandler() {
                override fun invokePopup(comp: Component?, x: Int, y: Int) {
                    val node = getSelectedNodesSameType<AbstractTreeNode<*>>()?.get(0) ?: return
                    val actionManager = ActionManager.getInstance()
                    val totalActions = mutableListOf<AnAction>()
                    if (node is ActionGroupOnRightClick) {
                        val actionGroupName = node.actionGroupName()

                        (actionGroupName.let { groupName -> actionManager.getAction(groupName) } as? ActionGroup)?.let { group ->
                            val context = comp?.let { DataManager.getInstance().getDataContext(it, x, y) } ?: return@let
                            val event = AnActionEvent.createFromDataContext(actionPlace, null, context)
                            totalActions.addAll(group.getChildren(event))
                        }
                    }

                    if (node is PinnedConnectionNode) {
                        totalActions.add(actionManager.getAction("aws.toolkit.connection.pinning.unpin"))
                    }

                    val actionGroup = DefaultActionGroup(totalActions)
                    if (actionGroup.childrenCount > 0) {
                        val popupMenu = actionManager.createActionPopupMenu(actionPlace, actionGroup)
                        popupMenu.setTargetComponent(this@AbstractExplorerTreeToolWindow)
                        popupMenu.component.show(comp, x, y)
                    }
                }
            }
        )

        fun redraw() {
            // redraw toolbars
            ActivityTracker.getInstance().inc()
            runInEdt {
                redrawContent()
            }
        }

        ApplicationManager.getApplication().messageBus.connect(this).subscribe(
            BearerTokenProviderListener.TOPIC,
            object : BearerTokenProviderListener {
                override fun onChange(providerId: String, newScopes: List<String>?) {
                    redraw()
                }
            }
        )
        ApplicationManager.getApplication().messageBus.connect(this).subscribe(
            ToolkitConnectionManagerListener.TOPIC,
            object : ToolkitConnectionManagerListener {
                override fun activeConnectionChanged(newConnection: ToolkitConnection?) {
                    redraw()
                }
            }
        )
        ApplicationManager.getApplication().messageBus.connect(this).subscribe(
            ConnectionPinningManagerListener.TOPIC,
            object : ConnectionPinningManagerListener {
                override fun pinnedConnectionChanged(feature: FeatureWithPinnedConnection, newConnection: ToolkitConnection?) {
                    redraw()
                }
            }
        )

        redrawContent()

        TreeUtil.expand(tree, 2)
    }

    abstract val actionPlace: String

    override fun dispose() {}

    override fun getData(dataId: String): Any? =
        when {
            ExplorerTreeToolWindowDataKeys.SELECTED_NODES.`is`(dataId) -> getSelectedNodes<AbstractTreeNode<*>>()
            ExplorerTreeToolWindowDataKeys.REFRESH_CALLBACK.`is`(dataId) -> fun() { redrawContent() }

            else -> null
        }

    private inline fun <reified T : AbstractTreeNode<*>> getSelectedNodesSameType(): List<T>? {
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

    private inline fun <reified T : AbstractTreeNode<*>> getSelectedNodes() = tree.selectionPaths?.let { treePaths ->
        treePaths.map { it.lastPathComponent }
            .filterIsInstance<DefaultMutableTreeNode>()
            .map { it.userObject }
            .filterIsInstance<T>()
            .toList()
    }.orEmpty()

    fun redrawContent() {
        setContent(
            ScrollPaneFactory.createScrollPane(tree)
        )
        // required for refresh
        val state = TreeState.createOn(tree)
        treeModel.invalidate()
        state.applyTo(tree)
    }

    fun showGotIt(node: String?, tooltip: GotItTooltip) {
        TreeUtil.promiseExpand(tree, 2).onSuccess {
            node ?: return@onSuccess
            treeModel.invoker.invoke {
                val path = treeModel.asSequence().firstOrNull { (it.userObject as? AbstractTreeNode<*>)?.value == node }?.path ?: return@invoke
                runInEdt {
                    val pointToRight = tree.getPathBounds(TreePath(path))?.let { Point(it.x + it.width, it.y + it.height / 2) } ?: return@runInEdt
                    tooltip.withPosition(Balloon.Position.atRight).show(tree) { _, _ -> pointToRight }
                }
            }
        }
    }
}

object ExplorerTreeToolWindowDataKeys {
    val SELECTED_NODES = DataKey.create<List<AbstractTreeNode<*>>>("aws.explorer.tree.selectedNodes")
    val REFRESH_CALLBACK = DataKey.create<() -> Unit>("aws.explorer.tree.refreshCallback")
}
