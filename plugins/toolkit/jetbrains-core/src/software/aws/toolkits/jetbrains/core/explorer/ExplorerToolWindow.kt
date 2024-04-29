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
import com.intellij.openapi.actionSystem.ActionPlaces
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.DataKey
import com.intellij.openapi.actionSystem.DefaultActionGroup
import com.intellij.openapi.actionSystem.Separator
import com.intellij.openapi.actionSystem.ex.ActionManagerEx
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.application.runReadAction
import com.intellij.openapi.components.service
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
import com.intellij.util.ui.tree.TreeUtil
import org.jetbrains.concurrency.CancellablePromise
import software.aws.toolkits.jetbrains.ToolkitPlaces
import software.aws.toolkits.jetbrains.core.credentials.AwsBearerTokenConnection
import software.aws.toolkits.jetbrains.core.credentials.AwsConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.AwsConnectionManagerConnection
import software.aws.toolkits.jetbrains.core.credentials.ConnectionSettingsStateChangeNotifier
import software.aws.toolkits.jetbrains.core.credentials.ConnectionState
import software.aws.toolkits.jetbrains.core.credentials.CredentialManager
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnection
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManager
import software.aws.toolkits.jetbrains.core.credentials.ToolkitConnectionManagerListener
import software.aws.toolkits.jetbrains.core.credentials.sono.isSono
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
import software.aws.toolkits.jetbrains.core.explorer.webview.ToolkitWebviewPanel
import software.aws.toolkits.jetbrains.core.gettingstarted.editor.GettingStartedPanel
import software.aws.toolkits.jetbrains.core.gettingstarted.rolePopupFromConnection
import software.aws.toolkits.jetbrains.core.gettingstarted.shouldShowNonWebviewUI
import software.aws.toolkits.jetbrains.core.webview.BrowserState
import software.aws.toolkits.jetbrains.services.dynamic.explorer.DynamicResourceResourceTypeNode
import software.aws.toolkits.jetbrains.ui.CenteredInfoPanel
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.FeatureId
import software.aws.toolkits.telemetry.UiTelemetry
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
import kotlin.reflect.KClass

class ExplorerToolWindow(private val project: Project) :
    SimpleToolWindowPanel(true, true),
    ConnectionSettingsStateChangeNotifier,
    ToolkitConnectionManagerListener,
    Disposable {
    private val actionManager = ActionManagerEx.getInstanceEx()
    private val treePanelWrapper = NonOpaquePanel()
    private val awsTreeModel = AwsExplorerTreeStructure(project)

    // The 4 max threads is arbitrary, but we want > 1 so that we can load more than one node at a time
    private val structureTreeModel = StructureTreeModel(awsTreeModel, null, Invoker.forBackgroundPoolWithReadAction(this), this)
    private val awsTree = createTree(AsyncTreeModel(structureTreeModel, true, this))
    private val awsTreePanel = ScrollPaneFactory.createScrollPane(awsTree)
    private val accountSettingsManager = AwsConnectionManager.getInstance(project)
    private val connectionManager = ToolkitConnectionManager.getInstance(project)

    init {
        background = UIUtil.getTreeBackground()
        setContent(treePanelWrapper)

        project.messageBus.connect(this).subscribe(AwsConnectionManager.CONNECTION_SETTINGS_STATE_CHANGED, this)
        ApplicationManager.getApplication().messageBus.connect(this).subscribe(ToolkitConnectionManagerListener.TOPIC, this)

        connectionChanged(connectionManager.activeConnection())
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

    override fun activeConnectionChanged(newConnection: ToolkitConnection?) {
        // weird race condition where message bus fires before active connection has reflected in the connection manager
        connectionChanged(newConnection)
    }

    override fun settingsStateChanged(newState: ConnectionState) {
        // we use the active connection to ignore changes to AwsConnectionManager when it's not the active connection
        connectionChanged(connectionManager.activeConnection())
    }

    private fun connectionChanged(newConnection: ToolkitConnection?) {
        val connectionState = accountSettingsManager.connectionState

        fun drawConnectionManagerPanel() {
            runInEdt {
                treePanelWrapper.setContent(
                    when (connectionState) {
                        is ConnectionState.ValidConnection -> {
                            invalidateTree()
                            awsTreePanel
                        }
                        else -> createInfoPanel(connectionState)
                    }
                )
            }
        }

        when (newConnection) {
            is AwsConnectionManagerConnection -> {
                drawConnectionManagerPanel()
            }

            null -> {
                // double check that we don't already have iam creds because the ToolkitConnectionListener can fire last, leading to weird state
                // where we show "setup" button instead of explorer tree
                if (CredentialManager.getInstance().getCredentialIdentifiers().isNotEmpty()) {
                    drawConnectionManagerPanel()
                    UiTelemetry.click(project, "ExplorerToolWindow_raceConditionHit")
                } else {
                    runInEdt {
                        treePanelWrapper.setContent(
                            CenteredInfoPanel().apply {
                                addLine(message("gettingstarted.explorer.new.setup.info"))
                                addDefaultActionButton(message("gettingstarted.explorer.new.setup")) {
                                    if (shouldShowNonWebviewUI()) {
                                        GettingStartedPanel.openPanel(project)
                                    } else {
                                        ToolkitWebviewPanel.getInstance(project).browser?.prepareBrowser(BrowserState(FeatureId.AwsExplorer, true))
                                        showWebview(project)
                                    }
                                }
                            }
                        )
                    }
                }
            }

            is AwsBearerTokenConnection -> {
                runInEdt {
                    treePanelWrapper.setContent(
                        CenteredInfoPanel().apply {
                            if (!newConnection.isSono() || CredentialManager.getInstance().getCredentialIdentifiers().isEmpty()) {
                                // if no iam credentials or we're connected to identity center...
                                addLine(message("gettingstarted.explorer.iam.add.info"))
                                addDefaultActionButton(message("gettingstarted.explorer.iam.add")) {
                                    // if builder id, popup identity center add connection
                                    // else if already identity center, popup just the role selector
                                    rolePopupFromConnection(project, newConnection)
                                }
                            } else {
                                // else if iam credentials available
                                addLine(message("gettingstarted.explorer.iam.switch"))
                            }
                        }
                    )
                }
            }

            else -> {
                // tree doesn't support other connection types yet
            }
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

    fun <T : AbstractTreeNode<*>> findNode(nodeType: KClass<T>): CancellablePromise<AbstractTreeNode<*>?> =
        runReadAction {
            structureTreeModel.invoker.computeLater {
                structureTreeModel.root.children().asSequence()
                    .filterIsInstance<DefaultMutableTreeNode>()
                    .firstOrNull { nodeType.isInstance(it.userObject) }
                    ?.userObject as AbstractTreeNode<*>?
            }
        }

    // Save the state and reapply it after we invalidate (which is the point where the state is wiped).
    // Items are expanded again if their user object is unchanged (.equals()).
    private fun withSavedState(tree: Tree, block: () -> Unit) {
        // TODO: do we actually need this? re-evaluate limits at later time
        // never re-expand dynamic resource nodes because api throttles aggressively
        TreeUtil.collectExpandedPaths(tree).filter { TreeUtil.getLastUserObject(it) is DynamicResourceResourceTypeNode }.forEach {
            tree.collapsePath(it)
        }

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
                        val popupMenu = actionManager.createActionPopupMenu(ToolkitPlaces.EXPLORER_TOOL_WINDOW, actionGroup)
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
        fun getInstance(project: Project): ExplorerToolWindow = project.service()
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
