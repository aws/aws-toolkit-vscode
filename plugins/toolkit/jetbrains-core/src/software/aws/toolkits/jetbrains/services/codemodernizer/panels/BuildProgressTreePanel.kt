// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codemodernizer.panels

import com.intellij.icons.AllIcons
import com.intellij.openapi.application.runInEdt
import com.intellij.ui.AnimatedIcon
import com.intellij.ui.JBColor
import com.intellij.ui.ScrollPaneFactory
import com.intellij.ui.components.JBLabel
import com.intellij.ui.treeStructure.Tree
import icons.AwsIcons
import software.aws.toolkits.jetbrains.services.codemodernizer.constants.CodeModernizerUIConstants
import software.aws.toolkits.jetbrains.services.codemodernizer.model.BuildProgressStepTreeItem
import software.aws.toolkits.jetbrains.services.codemodernizer.model.BuildStepStatus
import software.aws.toolkits.jetbrains.services.codemodernizer.model.ProgressStepId
import software.aws.toolkits.jetbrains.services.codemodernizer.ui.components.PanelHeaderFactory
import software.aws.toolkits.jetbrains.services.codewhisperer.layout.CodeWhispererLayoutConfig
import software.aws.toolkits.jetbrains.services.codewhisperer.layout.CodeWhispererLayoutConfig.addHorizontalGlue
import software.aws.toolkits.resources.message
import java.awt.BorderLayout
import java.awt.Component
import java.awt.GridBagLayout
import javax.swing.BorderFactory
import javax.swing.BoxLayout
import javax.swing.JPanel
import javax.swing.JTree
import javax.swing.event.TreeExpansionEvent
import javax.swing.event.TreeWillExpandListener
import javax.swing.tree.DefaultMutableTreeNode
import javax.swing.tree.DefaultTreeCellRenderer
import javax.swing.tree.DefaultTreeModel
import javax.swing.tree.ExpandVetoException

class BuildProgressTreePanel : JPanel(BorderLayout()) {
    var headerLabel = PanelHeaderFactory().createPanelHeader(message("codemodernizer.toolwindow.transformation.progress.header"))

    val headerPanel = JPanel(GridBagLayout()).apply {
        layout = GridBagLayout()
        add(headerLabel, CodeWhispererLayoutConfig.inlineLabelConstraints)
    }

    val headerInfoLabelPanel = JPanel(GridBagLayout()).apply {
        add(headerPanel)
        addHorizontalGlue()
    }

    val tree = Tree()
    val scrollPane = ScrollPaneFactory.createScrollPane(tree, true)
    var root = defaultRoot()

    var treeModel = DefaultTreeModel(root)
    val buildNodes = mutableListOf<BuildProgressStepTreeItem>()

    init {
        add(BorderLayout.NORTH, headerInfoLabelPanel)
        add(BorderLayout.CENTER, scrollPane)
    }

    private fun defaultRoot() = DefaultMutableTreeNode(
        BuildProgressStepTreeItem(message("codemodernizer.toolwindow.progress.parent"), BuildStepStatus.WORKING, ProgressStepId.ROOT_STEP)
    )

    fun setDefaultUI() {
        isVisible = true
        scrollPane.border = BorderFactory.createEmptyBorder(
            CodeModernizerUIConstants.SCROLL_PANEL.PADDING_TOP,
            CodeModernizerUIConstants.SCROLL_PANEL.PADDING_LEFT,
            CodeModernizerUIConstants.SCROLL_PANEL.PADDING_BOTTOM,
            CodeModernizerUIConstants.SCROLL_PANEL.PADDING_RIGHT
        )
        renderTree()
    }

    fun renderTree() {
        tree.apply {
            isRootVisible = false
            showsRootHandles = false
            cellRenderer = CustomTreeCellRenderer()
            model = treeModel
            expandAllRowsAndSubTrees(tree)
            revalidate()
            repaint()
            putClientProperty(AnimatedIcon.ANIMATION_IN_RENDERER_ALLOWED, true)
        }

        // Remove default Collapse event for tree so users can NEVER collapse
        // the tree
        tree.addTreeWillExpandListener(object : TreeWillExpandListener {
            override fun treeWillExpand(event: TreeExpansionEvent) {}
            override fun treeWillCollapse(event: TreeExpansionEvent) {
                throw ExpandVetoException(event, "Collapsing tree not allowed")
            }
        })

        revalidate()
        repaint()
    }

    fun renderTree(updatedStatuses: List<BuildProgressStepTreeItem>) = runInEdt {
        setUpTreeData(updatedStatuses)
        renderTree()
    }

    fun clearTree() {
        root = defaultRoot()
        buildNodes.clear()
        treeModel = DefaultTreeModel(root)
    }

    fun setUpTreeData(items: List<BuildProgressStepTreeItem>) {
        root = defaultRoot()
        buildNodes.clear()
        buildNodes.addAll(items)
        treeModel = DefaultTreeModel(root)
        val allStagesNodes = items.filter { it.id != ProgressStepId.PLAN_STEP }
        val planSteps = items.filter { it.id == ProgressStepId.PLAN_STEP }

        allStagesNodes.forEach {
            val node = DefaultMutableTreeNode(it)
            if (it.id == ProgressStepId.TRANSFORMING) {
                planSteps.forEach { planStep ->
                    node.add(DefaultMutableTreeNode(planStep))
                }
            }
            root.add(node)
        }
    }

    private fun expandAllRowsAndSubTrees(tree: Tree) {
        for (i in 0 until tree.getRowCount()) {
            tree.expandRow(i)
        }
    }

    fun getCurrentElements() = buildNodes

    private class CustomTreeCellRenderer : DefaultTreeCellRenderer() {
        override fun getTreeCellRendererComponent(
            tree: JTree,
            value: Any,
            sel: Boolean,
            expanded: Boolean,
            leaf: Boolean,
            row: Int,
            hasFocus: Boolean
        ): Component {
            val treeRenderer = super.getTreeCellRendererComponent(tree, value, sel, expanded, leaf, row, hasFocus)
            if (value is DefaultMutableTreeNode) {
                val userObject = value.userObject
                if (userObject is BuildProgressStepTreeItem) {
                    val iconLabel = when (userObject.status) {
                        BuildStepStatus.DONE -> JBLabel(AwsIcons.CodeTransform.CHECKMARK_GREEN)
                        BuildStepStatus.WARNING -> JBLabel(AwsIcons.CodeTransform.CHECKMARK_GRAY)
                        BuildStepStatus.ERROR -> JBLabel(AllIcons.General.Error)
                        BuildStepStatus.WORKING -> JBLabel(AnimatedIcon.Default.INSTANCE)
                    }
                    val progressLabel = JBLabel().apply {
                        text = if (userObject.finishedTime != null) {
                            userObject.text + " finished at " + userObject.finishedTime
                        } else {
                            userObject.text
                        }
                        border = BorderFactory.createEmptyBorder(0, 5, 0, 0)
                    }

                    val stepRunningtimeLabel = JBLabel().apply {
                        if (userObject.runtime != null) {
                            text = userObject.runtime
                            foreground = JBColor.GRAY
                            border = BorderFactory.createEmptyBorder(0, 10, 0, 0)
                        }
                    }
                    val panel = JPanel().apply {
                        layout = BoxLayout(this, BoxLayout.X_AXIS)
                        add(iconLabel)
                        add(progressLabel, CodeWhispererLayoutConfig.inlineLabelConstraints)
                        add(stepRunningtimeLabel, CodeWhispererLayoutConfig.inlineLabelConstraints)
                    }
                    return panel
                }
            }

            return treeRenderer
        }
    }
}
