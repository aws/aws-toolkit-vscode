package software.aws.toolkits.jetbrains.core.explorer

import com.intellij.ide.util.treeView.AbstractTreeBuilder
import com.intellij.ide.util.treeView.NodeDescriptor
import com.intellij.ide.util.treeView.NodeRenderer
import com.intellij.openapi.actionSystem.ActionGroup
import com.intellij.openapi.actionSystem.ActionPlaces
import com.intellij.openapi.actionSystem.DataKey
import com.intellij.openapi.actionSystem.ex.ActionManagerEx
import com.intellij.openapi.options.ShowSettingsUtil
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.SimpleToolWindowPanel
import com.intellij.openapi.util.Disposer
import com.intellij.ui.HyperlinkLabel
import com.intellij.ui.PopupHandler
import com.intellij.ui.ScrollPaneFactory
import com.intellij.ui.TreeUIHelper
import com.intellij.ui.components.panels.Wrapper
import com.intellij.ui.treeStructure.Tree
import com.intellij.util.ui.JBSwingUtilities
import com.intellij.util.ui.UIUtil
import software.aws.toolkits.jetbrains.core.AwsSettingsProvider
import software.aws.toolkits.jetbrains.core.SettingsChangedListener
import software.aws.toolkits.jetbrains.core.credentials.AwsCredentialsConfigurable
import software.aws.toolkits.jetbrains.core.credentials.AwsCredentialsProfileProvider
import software.aws.toolkits.jetbrains.core.credentials.AwsProfilePanel
import software.aws.toolkits.jetbrains.core.credentials.CredentialProfile
import software.aws.toolkits.jetbrains.core.explorer.ExplorerDataKeys.SELECTED_RESOURCE_NODES
import software.aws.toolkits.jetbrains.core.explorer.ExplorerDataKeys.SELECTED_SERVICE_NODE
import software.aws.toolkits.jetbrains.core.region.AwsRegionPanel
import software.aws.toolkits.jetbrains.utils.MutableMapWithListener
import java.awt.Component
import java.awt.FlowLayout
import java.awt.event.ActionListener
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.swing.JPanel
import javax.swing.JTree
import javax.swing.event.HyperlinkEvent
import javax.swing.tree.DefaultMutableTreeNode
import javax.swing.tree.DefaultTreeModel

class ExplorerToolWindow(val project: Project) :
        SimpleToolWindowPanel(true, false), MutableMapWithListener.MapChangeListener<String, CredentialProfile>,
        SettingsChangedListener {

    private val settingsProvider = AwsSettingsProvider.getInstance(project).addListener(this)
    private val actionManager = ActionManagerEx.getInstanceEx()

    private val treePanelWrapper: Wrapper = Wrapper()
    private val profilePanel: AwsProfilePanel
    private val regionPanel: AwsRegionPanel
    private val errorPanel: JPanel
    private val mainPanel: JPanel
    private var awsTree: Tree? = null

    init {
        val link = HyperlinkLabel("Open AWS Configuration to configure your AWS account.")
        link.addHyperlinkListener { e ->
            if (e.eventType == HyperlinkEvent.EventType.ACTIVATED) {
                ShowSettingsUtil.getInstance().showSettingsDialog(project, AwsCredentialsConfigurable::class.java)
            }
        }

        errorPanel = JPanel()
        errorPanel.add(link)

        profilePanel = AwsProfilePanel(project, settingsProvider.currentProfile)
        profilePanel.addActionListener(ActionListener { onAwsProfileOrRegionComboSelected() })

        regionPanel = AwsRegionPanel(project)
        regionPanel.addActionListener(ActionListener { onAwsProfileOrRegionComboSelected() })

        mainPanel = JPanel(FlowLayout(FlowLayout.LEADING, 0, 0))
        mainPanel.add(profilePanel.profilePanel)
        mainPanel.add(regionPanel.regionPanel)
        setToolbar(mainPanel)
        setContent(treePanelWrapper)

        updateModel()
    }

    /**
     * Listens to the underlying profile map to keep being synced with the content pane.
     */
    override fun onUpdate() {
        if (AwsCredentialsProfileProvider.getInstance(project).getProfiles().isEmpty()) {
            treePanelWrapper.setContent(errorPanel)
        }
    }

    override fun profileChanged() {
        updateModel()
    }

    override fun regionChanged() {
        updateModel()
    }

    private fun onAwsProfileOrRegionComboSelected() {
        val selectedProfile = profilePanel.getSelectedProfile()
        val selectedRegion = regionPanel.getSelectedRegion()

        if (selectedProfile == null || selectedRegion == null) {
            treePanelWrapper.setContent(errorPanel)
            return
        }
        settingsProvider.currentRegion = selectedRegion
        settingsProvider.currentProfile = selectedProfile
    }

    private fun updateModel() {
        val model = DefaultTreeModel(DefaultMutableTreeNode())
        val newTree = createTree(model)
        val builder = AwsExplorerTreeBuilder(newTree, model, project)
        Disposer.register(project, builder)
        treePanelWrapper.setContent(ScrollPaneFactory.createScrollPane(newTree))

        awsTree?.let {
            AbstractTreeBuilder.getBuilderFor(it)?.let {
                Disposer.dispose(it)
            }
        }

        awsTree = newTree
    }

    private fun createTree(model: DefaultTreeModel): Tree {
        val awsTree = Tree()
        TreeUIHelper.getInstance().installTreeSpeedSearch(awsTree)
        UIUtil.setLineStyleAngled(awsTree)
        awsTree.isRootVisible = false
        awsTree.autoscrolls = true
        awsTree.cellRenderer = AwsTreeCellRenderer()
        awsTree.addMouseListener(object : MouseAdapter() {
            override fun mouseClicked(event: MouseEvent) {
                if (JBSwingUtilities.isLeftMouseButton(event) && event.clickCount == 2) {
                    val selectedElement = awsTree.selectionPath?.lastPathComponent as? DefaultMutableTreeNode ?: return
                    val awsExplorerNode = selectedElement.userObject as? AwsExplorerNode<*> ?: return
                    awsExplorerNode.onDoubleClick(model, selectedElement)
                }
            }
        })

        awsTree.addMouseListener(object : PopupHandler() {
            override fun invokePopup(comp: Component?, x: Int, y: Int) {
                // Build a right click menu based on the selected first node
                // All nodes must be the same type (e.g. all S3 buckets, or a service node)
                val explorerNode = getSelectedNodesSameType<AwsExplorerNode<*>>()?.get(0) ?: return
                val actionGroupName = when (explorerNode) {
                    is AwsExplorerServiceRootNode ->
                        "aws.toolkit.explorer.${explorerNode.serviceName()}"
                    is AwsExplorerResourceNode<*> ->
                        "aws.toolkit.explorer.${explorerNode.serviceName()}.${explorerNode.resourceType()}"
                    else ->
                        return
                }
                val actionGroup = actionManager.getAction(actionGroupName) as? ActionGroup ?: return
                val popupMenu = actionManager.createActionPopupMenu(ActionPlaces.UNKNOWN, actionGroup)
                popupMenu.component.show(component, x, y)
            }
        })

        return awsTree
    }

    override fun getData(dataId: String?): Any? {
        if (SELECTED_RESOURCE_NODES.`is`(dataId)) {
            return getSelectedNodesSameType<AwsExplorerResourceNode<*>>()
        }
        if (SELECTED_SERVICE_NODE.`is`(dataId)) {
            return getSelectedServiceNode()
        }

        return super.getData(dataId)
    }

    private fun getSelectedNode(): AwsExplorerNode<*>? {
        val nodes = getSelectedNodes<AwsExplorerNode<*>>()
        return if (nodes.size == 1) nodes[0] else null
    }

    private fun getSelectedServiceNode(): AwsExplorerServiceRootNode? {
        return getSelectedNode() as? AwsExplorerServiceRootNode
    }

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

    private inline fun <reified T : AwsExplorerNode<*>> getSelectedNodes(): List<T> {
        return awsTree?.selectionPaths?.let {
            it.map { it.lastPathComponent }
                    .filterIsInstance<DefaultMutableTreeNode>()
                    .map { it.userObject }
                    .filterIsInstance<T>()
                    .toList()
        } ?: emptyList<T>()
    }

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