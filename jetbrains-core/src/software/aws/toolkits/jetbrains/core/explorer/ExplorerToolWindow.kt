// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

@file:Suppress("DEPRECATION") // TODO: Investigate AsyncTreeModel FIX_WHEN_MIN_IS_192
package software.aws.toolkits.jetbrains.core.explorer

import com.intellij.execution.Location
import com.intellij.ide.util.treeView.NodeDescriptor
import com.intellij.ide.util.treeView.NodeRenderer
import com.intellij.openapi.actionSystem.ActionGroup
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.DataKey
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.actionSystem.ex.ActionManagerEx
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.SimpleToolWindowPanel
import com.intellij.ui.DoubleClickListener
import com.intellij.ui.HyperlinkLabel
import com.intellij.ui.PopupHandler
import com.intellij.ui.ScrollPaneFactory
import com.intellij.ui.TreeUIHelper
import com.intellij.ui.components.panels.Wrapper
import com.intellij.ui.treeStructure.Tree
import com.intellij.util.ui.UIUtil
import software.aws.toolkits.jetbrains.components.telemetry.ToolkitActionPlaces
import software.aws.toolkits.jetbrains.core.SettingsSelector
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager.AccountSettingsChangedNotifier
import software.aws.toolkits.jetbrains.core.credentials.ProjectAccountSettingsManager.AccountSettingsChangedNotifier.AccountSettingsEvent
import software.aws.toolkits.jetbrains.core.explorer.ExplorerDataKeys.SELECTED_RESOURCE_NODES
import software.aws.toolkits.jetbrains.core.explorer.ExplorerDataKeys.SELECTED_SERVICE_NODE
import software.aws.toolkits.jetbrains.core.explorer.actions.CopyArnAction
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerResourceNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerServiceRootNode
import software.aws.toolkits.jetbrains.services.lambda.LambdaFunctionNode
import software.aws.toolkits.jetbrains.services.lambda.execution.remote.RemoteLambdaLocation
import software.aws.toolkits.jetbrains.ui.tree.AsyncTreeModel
import software.aws.toolkits.jetbrains.ui.tree.StructureTreeModel
import software.aws.toolkits.resources.message
import java.awt.Component
import java.awt.event.MouseEvent
import javax.swing.JPanel
import javax.swing.JTree
import javax.swing.tree.DefaultMutableTreeNode
import javax.swing.tree.TreeModel

class ExplorerToolWindow(private val project: Project) : SimpleToolWindowPanel(true, true), AccountSettingsChangedNotifier {
    private val actionManager = ActionManagerEx.getInstanceEx()
    private val projectAccountSettingsManager = ProjectAccountSettingsManager.getInstance(project)

    private val treePanelWrapper: Wrapper = Wrapper()
    private val errorPanel: JPanel
    private val awsTreeModel = AwsExplorerTreeStructure(project)
    private val structureTreeModel = StructureTreeModel(
        awsTreeModel,
        compareBy(String.CASE_INSENSITIVE_ORDER) { it.toString() },
        project)
    private var awsTree = createTree(AsyncTreeModel(structureTreeModel, true, project))
    private val awsTreePanel = ScrollPaneFactory.createScrollPane(awsTree)
    private val settingsSelector by lazy {
        SettingsSelector(project)
    }

    init {
        val select = HyperlinkLabel(message("configure.toolkit"))
        select.addHyperlinkListener { settingsSelector.settingsPopup(select, showRegions = false).showInCenterOf(select) }

        errorPanel = JPanel()
        errorPanel.add(select)

        setContent(treePanelWrapper)

        project.messageBus.connect().subscribe(ProjectAccountSettingsManager.ACCOUNT_SETTINGS_CHANGED, this)

        treePanelWrapper.setContent(errorPanel)
    }

    override fun settingsChanged(event: AccountSettingsEvent) {
        if (!event.isLoading) {
            runInEdt {
                if (!projectAccountSettingsManager.hasActiveCredentials()) {
                    treePanelWrapper.setContent(errorPanel)
                } else {
                    invalidateTree()
                    treePanelWrapper.setContent(awsTreePanel)
                }
            }
        }
    }

    internal fun invalidateTree() {
        structureTreeModel.invalidate()
    }

    private fun createTree(model: TreeModel): Tree {
        val awsTree = Tree(model)
        TreeUIHelper.getInstance().installTreeSpeedSearch(awsTree)
        @Suppress("DEPRECATION") // TODO: Remove when we drop < 192 FIX_WHEN_MIN_IS_192
        UIUtil.setLineStyleAngled(awsTree)
        awsTree.isRootVisible = false
        awsTree.autoscrolls = true
        awsTree.cellRenderer = AwsTreeCellRenderer()

        object : DoubleClickListener() {
            override fun onDoubleClick(event: MouseEvent): Boolean {
                val path = awsTree.getClosestPathForLocation(event.x, event.y)
                (path?.lastPathComponent as? AwsExplorerNode<*>)?.onDoubleClick()
                return true
            }
        }.installOn(awsTree)

        awsTree.addMouseListener(object : PopupHandler() {
            override fun invokePopup(comp: Component?, x: Int, y: Int) {
                // Build a right click menu based on the selected first node
                // All nodes must be the same type (e.g. all S3 buckets, or a service node)
                val explorerNode = getSelectedNodesSameType<AwsExplorerNode<*>>()?.get(0) ?: return
                val additionalActions = mutableListOf<AnAction>()
                val actionGroupName = when (explorerNode) {
                    is AwsExplorerServiceRootNode ->
                        "aws.toolkit.explorer.${explorerNode.serviceId}"
                    is AwsExplorerResourceNode<*> -> {
                        additionalActions.add(CopyArnAction())
                        val suffix = if (explorerNode.immutable) ".immutable" else ""
                        "aws.toolkit.explorer.${explorerNode.serviceId}.${explorerNode.resourceType()}$suffix"
                    }
                    else -> null
                }
                val actionGroup = DefaultActionGroup()
                (actionGroupName?.let { actionManager.getAction(it) } as? ActionGroup)?.let { actionGroup.addAll(it) }
                additionalActions.forEach { actionGroup.add(it) }

                if (actionGroup.childrenCount > 0) {
                    val popupMenu = actionManager.createActionPopupMenu(ToolkitActionPlaces.EXPLORER_WINDOW, actionGroup)
                    popupMenu.component.show(comp, x, y)
                }
            }
        })

        return awsTree
    }

    override fun getData(dataId: String): Any? {
        if (SELECTED_RESOURCE_NODES.`is`(dataId)) {
            return getSelectedNodesSameType<AwsExplorerResourceNode<*>>()
        }
        if (SELECTED_SERVICE_NODE.`is`(dataId)) {
            return getSelectedServiceNode()
        }
        if (Location.DATA_KEY.`is`(dataId)) {
            val lambdas = getSelectedNodesSameType<LambdaFunctionNode>()
            if (lambdas?.size != 1) {
                return null
            }

            return RemoteLambdaLocation(project, lambdas.first().value)
        }

        return super.getData(dataId)
    }

    private fun getSelectedNode(): AwsExplorerNode<*>? {
        val nodes = getSelectedNodes<AwsExplorerNode<*>>()
        return if (nodes.size == 1) nodes[0] else null
    }

    private fun getSelectedServiceNode(): AwsExplorerServiceRootNode? = getSelectedNode() as? AwsExplorerServiceRootNode

    /**
     * Returns the list of selected nodes if they are all of the same type
     */
    private inline fun <reified T : AwsExplorerNode<*>> getSelectedNodesSameType(): List<T>? {
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

    private inline fun <reified T : AwsExplorerNode<*>> getSelectedNodes() = awsTree.selectionPaths?.let {
        it.map { it.lastPathComponent }
            .filterIsInstance<DefaultMutableTreeNode>()
            .map { it.userObject }
            .filterIsInstance<T>()
            .toList()
    } ?: emptyList<T>()

    private class AwsTreeCellRenderer : NodeRenderer() {
        override fun customizeCellRenderer(
            tree: JTree,
            value: Any,
            selected: Boolean,
            expanded: Boolean,
            leaf: Boolean,
            row: Int,
            hasFocus: Boolean
        ) {
            super.customizeCellRenderer(tree, value, selected, expanded, leaf, row, hasFocus)
            if (value is DefaultMutableTreeNode && value.userObject is NodeDescriptor<*>) {
                icon = (value.userObject as NodeDescriptor<*>).icon
            }
        }
    }
}

object ExplorerDataKeys {
    /**
     * Returns all the selected resource nodes. getData() will return null if not all selected items are same type
     */
    val SELECTED_RESOURCE_NODES = DataKey.create<List<AwsExplorerResourceNode<*>>>("aws.explorer.resourceNodes")
    /**
     * Returns the selected Service node. getData() will return null if more than one item is selected
     */
    val SELECTED_SERVICE_NODE = DataKey.create<AwsExplorerNode<*>>("aws.explorer.serviceNode")
}