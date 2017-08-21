package com.amazonaws.intellij.ui.explorer
import com.amazonaws.intellij.core.region.AwsDefaultRegionProvider
import com.amazonaws.intellij.ui.widgets.AwsRegionPanel
import com.intellij.ide.util.treeView.NodeDescriptor
import com.intellij.ide.util.treeView.NodeRenderer
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.SimpleToolWindowPanel
import com.intellij.openapi.util.Disposer
import com.intellij.ui.TreeUIHelper
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.components.panels.Wrapper
import com.intellij.ui.treeStructure.Tree
import com.intellij.util.ui.UIUtil
import java.awt.FlowLayout
import java.awt.event.ActionListener
import javax.swing.JPanel
import javax.swing.JTree
import javax.swing.tree.DefaultMutableTreeNode
import javax.swing.tree.DefaultTreeModel

class ExplorerToolWindow(val project: Project):
        SimpleToolWindowPanel(true, false) {

    private val treePanelWrapper: Wrapper = Wrapper();
    private val regionProvider: AwsDefaultRegionProvider = AwsDefaultRegionProvider.getInstance(project)
    private val regionPanel: AwsRegionPanel
    private val mainPanel: JPanel

    init{
        regionPanel = AwsRegionPanel(regionProvider.currentRegion)
        regionPanel.addActionListener(ActionListener { onAwsRegionComboSelected() })

        mainPanel = JPanel(FlowLayout(FlowLayout.LEADING, 0, 0))
        mainPanel.add(regionPanel.regionPanel)
        setToolbar(mainPanel)
        setContent(treePanelWrapper)
        onAwsRegionComboSelected()
    }

    private fun onAwsRegionComboSelected() {
        val selectedRegion = regionPanel.getSelectedRegion() ?: return
        val model = DefaultTreeModel(DefaultMutableTreeNode())
        val awsTree = createTree()
        val builder = AwsExplorerTreeBuilder(awsTree, model, project, selectedRegion.id)
        Disposer.register(project, builder)
        treePanelWrapper.setContent(JBScrollPane(awsTree))
        regionProvider.currentRegion = selectedRegion
    }

    private fun createTree(): JTree {
        val awsTree = Tree()
        TreeUIHelper.getInstance().installTreeSpeedSearch(awsTree)
        UIUtil.setLineStyleAngled(awsTree)
        awsTree.isRootVisible = false
        awsTree.autoscrolls = true
        awsTree.cellRenderer = AwsTreeCellRenderer()
        return awsTree
    }

    private class AwsTreeCellRenderer:NodeRenderer() {
        override fun customizeCellRenderer(tree: JTree, value: Any, selected: Boolean, expanded: Boolean, leaf: Boolean, row: Int, hasFocus: Boolean) {
            super.customizeCellRenderer(tree, value, selected, expanded, leaf, row, hasFocus)
            if (value is DefaultMutableTreeNode && value.userObject is NodeDescriptor<*>) {
                icon = (value.userObject as NodeDescriptor<*>).icon
            }
        }
    }
}