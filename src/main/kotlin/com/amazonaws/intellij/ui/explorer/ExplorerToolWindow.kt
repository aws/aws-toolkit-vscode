package com.amazonaws.intellij.ui.explorer
import com.amazonaws.intellij.core.region.AwsDefaultRegionProvider
import com.amazonaws.intellij.ui.ui.widgets.AwsRegionPanel
import com.intellij.ide.util.treeView.NodeDescriptor
import com.intellij.ide.util.treeView.NodeRenderer
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.components.panels.Wrapper
import com.intellij.ui.treeStructure.Tree
import com.intellij.util.ui.UIUtil
import java.awt.FlowLayout
import javax.swing.JPanel
import javax.swing.JTree
import javax.swing.tree.DefaultMutableTreeNode
import javax.swing.tree.DefaultTreeModel

class ExplorerToolWindow(val project: Project, val treePanelWrapper: Wrapper) {
    private val regionProvider: AwsDefaultRegionProvider = AwsDefaultRegionProvider.getInstance(project)
    private val regionPanel: AwsRegionPanel
    val mainPanel: JPanel

    init{
        this.regionPanel = AwsRegionPanel(regionProvider.currentRegion)
        regionPanel.addActionListener({ onAwsRegionComboSelected() })
        onAwsRegionComboSelected()
        mainPanel = JPanel(FlowLayout(FlowLayout.LEADING, 0, 0))
        mainPanel.add(regionPanel.regionPanel)
    }

    private fun onAwsRegionComboSelected() {
        val selectedRegion = regionPanel.selectedRegion
        val model = DefaultTreeModel(DefaultMutableTreeNode())
        val awsTree = createTree()
        val builder = AwsExplorerTreeBuilder(awsTree, model, project, selectedRegion)
        Disposer.register(project, builder)
        treePanelWrapper.setContent(JBScrollPane(awsTree))
        regionProvider.currentRegion = selectedRegion
    }

    private fun createTree(): JTree {
        val awsTree = Tree()
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