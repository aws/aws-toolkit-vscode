// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.core.explorer

import com.intellij.execution.Location
import com.intellij.ide.DataManager
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.ide.util.treeView.NodeDescriptor
import com.intellij.ide.util.treeView.NodeRenderer
import com.intellij.ide.util.treeView.TreeState
import com.intellij.openapi.Disposable
import com.intellij.openapi.actionSystem.ActionGroup
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionPlaces
import com.intellij.openapi.actionSystem.ActionToolbar.WRAP_LAYOUT_POLICY
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DataKey
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.actionSystem.Separator
import com.intellij.openapi.actionSystem.ex.ActionManagerEx
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.components.ServiceManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.SimpleToolWindowPanel
import com.intellij.ui.DoubleClickListener
import com.intellij.ui.HyperlinkAdapter
import com.intellij.ui.HyperlinkLabel
import com.intellij.ui.JBColor
import com.intellij.ui.PopupHandler
import com.intellij.ui.ScrollPaneFactory
import com.intellij.ui.TreeUIHelper
import com.intellij.ui.components.panels.NonOpaquePanel
import com.intellij.ui.tree.AsyncTreeModel
import com.intellij.ui.tree.StructureTreeModel
import com.intellij.ui.treeStructure.Tree
import com.intellij.util.concurrency.Invoker
import com.intellij.util.ui.GridBag
import com.intellij.util.ui.JBUI
import com.intellij.util.ui.UIUtil
import software.aws.toolkits.jetbrains.core.credentials.AwsConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.ChangeAccountSettingsMode
import software.aws.toolkits.jetbrains.core.credentials.ConnectionSettingsStateChangeNotifier
import software.aws.toolkits.jetbrains.core.credentials.ConnectionState
import software.aws.toolkits.jetbrains.core.credentials.SettingsSelectorComboBoxAction
import software.aws.toolkits.jetbrains.core.explorer.ExplorerDataKeys.SELECTED_NODES
import software.aws.toolkits.jetbrains.core.explorer.ExplorerDataKeys.SELECTED_RESOURCE_NODES
import software.aws.toolkits.jetbrains.core.explorer.ExplorerDataKeys.SELECTED_SERVICE_NODE
import software.aws.toolkits.jetbrains.core.explorer.actions.CopyArnAction
import software.aws.toolkits.jetbrains.core.explorer.actions.DeleteResourceAction
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerResourceNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.AwsExplorerServiceRootNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.ResourceActionNode
import software.aws.toolkits.jetbrains.core.explorer.nodes.ResourceLocationNode
import java.awt.Component
import java.awt.GridBagConstraints
import java.awt.GridBagLayout
import java.awt.event.MouseEvent
import javax.swing.JComponent
import javax.swing.JTextPane
import javax.swing.JTree
import javax.swing.event.HyperlinkEvent
import javax.swing.text.SimpleAttributeSet
import javax.swing.text.StyleConstants
import javax.swing.tree.DefaultMutableTreeNode
import javax.swing.tree.TreeModel

class ExplorerToolWindow(project: Project) : SimpleToolWindowPanel(true, true), ConnectionSettingsStateChangeNotifier, Disposable {
    private val actionManager = ActionManagerEx.getInstanceEx()
    private val treePanelWrapper = NonOpaquePanel()
    private val awsTreeModel = AwsExplorerTreeStructure(project)

    // The 4 max threads is arbitrary, but we want > 1 so that we can load more than one node at a time
    private val structureTreeModel = StructureTreeModel(awsTreeModel, null, Invoker.Background(this, 4), this)
    private val awsTree = createTree(AsyncTreeModel(structureTreeModel, true, this))
    private val awsTreePanel = ScrollPaneFactory.createScrollPane(awsTree)
    private val accountSettingsManager = AwsConnectionManager.getInstance(project)

    init {
        val group = DefaultActionGroup(
            SettingsSelectorComboBoxAction(project, ChangeAccountSettingsMode.CREDENTIALS),
            SettingsSelectorComboBoxAction(project, ChangeAccountSettingsMode.REGIONS)
        )

        toolbar = ActionManager.getInstance().createActionToolbar(ActionPlaces.TOOLBAR, group, true).apply {
            layoutPolicy = WRAP_LAYOUT_POLICY
        }.component

        background = UIUtil.getTreeBackground()
        setContent(treePanelWrapper)

        project.messageBus.connect(this).subscribe(AwsConnectionManager.CONNECTION_SETTINGS_STATE_CHANGED, this)
        settingsStateChanged(accountSettingsManager.connectionState)
    }

    private fun createInfoPanel(state: ConnectionState): JComponent {
        val panel = NonOpaquePanel(GridBagLayout())

        val gridBag = GridBag()
        gridBag.defaultAnchor = GridBagConstraints.CENTER
        gridBag.defaultWeightX = 1.0
        gridBag.defaultInsets = JBUI.insets(0, JBUI.scale(30), JBUI.scale(6), JBUI.scale(30))

        val textPane = JTextPane().apply {
            val textColor = if (state is ConnectionState.InvalidConnection) {
                JBColor.red
            } else {
                UIUtil.getInactiveTextColor()
            }

            with(styledDocument) {
                val center = SimpleAttributeSet().apply {
                    StyleConstants.setAlignment(this, StyleConstants.ALIGN_CENTER)
                    StyleConstants.setForeground(this, textColor)
                }
                setParagraphAttributes(0, length, center, false)
            }

            text = state.displayMessage
            isEditable = false
            background = UIUtil.getTreeBackground()
        }

        panel.add(textPane, gridBag.nextLine().next().fillCell())

        state.actions.forEach {
            panel.add(createActionLabel(it), gridBag.nextLine().next())
        }

        return panel
    }

    private fun createActionLabel(action: AnAction): HyperlinkLabel {
        val label = HyperlinkLabel(action.templateText ?: "BUG: $action lacks a text description")
        label.addHyperlinkListener(
            object : HyperlinkAdapter() {
                override fun hyperlinkActivated(e: HyperlinkEvent) {
                    val event = AnActionEvent.createFromAnAction(action, e.inputEvent, ActionPlaces.UNKNOWN, DataManager.getInstance().getDataContext(label))
                    action.actionPerformed(event)
                }
            }
        )

        return label
    }

    override fun settingsStateChanged(newState: ConnectionState) {
        runInEdt {
            treePanelWrapper.setContent(
                when (newState) {
                    is ConnectionState.ValidConnection -> {
                        invalidateTree()
                        awsTreePanel
                    }
                    else -> createInfoPanel(newState)
                }
            )
        }
    }

    /**
     * Invalidates tree nodes, causing IntelliJ to redraw the tree. Preserves node state.
     * Provide an AbstractTreeNode in order to redraw the tree from that point downwards
     * Otherwise redraws the entire tree
     *
     * @param selectedNode AbstractTreeNode to redraw the tree from
     */
    fun invalidateTree(selectedNode: AbstractTreeNode<*>? = null) {
        withSavedState(awsTree) {
            if (selectedNode != null) {
                structureTreeModel.invalidate(selectedNode, true)
            } else {
                structureTreeModel.invalidate()
            }
        }
    }

    // Save the state and reapply it after we invalidate (which is the point where the state is wiped).
    // Items are expanded again if their user object is unchanged (.equals()).
    private fun withSavedState(tree: Tree, block: () -> Unit) {
        val state = TreeState.createOn(tree)
        block()
        state.applyTo(tree)
    }

    private fun createTree(model: TreeModel): Tree {
        val awsTree = Tree(model)
        TreeUIHelper.getInstance().installTreeSpeedSearch(awsTree)
        awsTree.isRootVisible = false
        awsTree.autoscrolls = true
        awsTree.cellRenderer = AwsTreeCellRenderer()

        object : DoubleClickListener() {
            override fun onDoubleClick(event: MouseEvent): Boolean {
                val path = awsTree.getClosestPathForLocation(event.x, event.y)
                ((path?.lastPathComponent as? DefaultMutableTreeNode)?.userObject as? AwsExplorerNode<*>)?.onDoubleClick()
                return true
            }
        }.installOn(awsTree)

        awsTree.addMouseListener(
            object : PopupHandler() {
                override fun invokePopup(comp: Component?, x: Int, y: Int) {
                    // Build a right click menu based on the selected first node
                    // All nodes must be the same type (e.g. all S3 buckets, or a service node)
                    val explorerNode = getSelectedNodesSameType<AwsExplorerNode<*>>()?.get(0) ?: return
                    val actionGroupName = (explorerNode as? ResourceActionNode)?.actionGroupName()

                    val totalActions = mutableListOf<AnAction>()

                    (actionGroupName?.let { actionManager.getAction(it) } as? ActionGroup)?.let { totalActions.addAll(it.getChildren(null)) }

                    if (explorerNode is AwsExplorerResourceNode<*>) {
                        totalActions.add(CopyArnAction())
                    }

                    totalActions.find { it is DeleteResourceAction<*> }?.let {
                        totalActions.remove(it)
                        totalActions.add(Separator.create())
                        totalActions.add(it)
                    }

                    val actionGroup = DefaultActionGroup(totalActions)
                    if (actionGroup.childrenCount > 0) {
                        val popupMenu = actionManager.createActionPopupMenu("ExplorerToolWindow", actionGroup)
                        popupMenu.component.show(comp, x, y)
                    }
                }
            }
        )

        return awsTree
    }

    override fun getData(dataId: String) =
        when {
            SELECTED_NODES.`is`(dataId) -> getSelectedNodes<AwsExplorerNode<*>>()
            SELECTED_RESOURCE_NODES.`is`(dataId) -> getSelectedNodesSameType<AwsExplorerResourceNode<*>>()
            SELECTED_SERVICE_NODE.`is`(dataId) -> getSelectedServiceNode()
            Location.DATA_KEY.`is`(dataId) -> {
                val resourceNodes = getSelectedNodesSameType<AwsExplorerNode<*>>()
                if (resourceNodes?.size != 1) {
                    null
                } else {
                    (resourceNodes.first() as? ResourceLocationNode)?.location()
                }
            }
            else -> super.getData(dataId)
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

    override fun dispose() {
    }

    companion object {
        fun getInstance(project: Project): ExplorerToolWindow = ServiceManager.getService(project, ExplorerToolWindow::class.java)
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

    /**
     * Returns all the explorer nodes. getData() will return null if not all selected items are same type
     */
    val SELECTED_NODES = DataKey.create<List<AwsExplorerNode<*>>>("aws.explorer.explorerNodes")
}
