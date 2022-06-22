// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.codescan

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.ActionGroup
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionToolbar
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.AnimatedIcon
import com.intellij.ui.ScrollPaneFactory
import com.intellij.ui.border.CustomLineBorder
import com.intellij.ui.treeStructure.Tree
import com.intellij.util.ui.JBUI
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.listeners.CodeWhispererCodeScanTreeMouseListener
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererColorUtil.INACTIVE_TEXT_COLOR
import software.aws.toolkits.resources.message
import java.awt.BorderLayout
import java.awt.Component
import java.awt.GridBagLayout
import java.time.Instant
import java.time.format.DateTimeFormatter
import javax.swing.BorderFactory
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.JTree
import javax.swing.tree.DefaultMutableTreeNode
import javax.swing.tree.TreeCellRenderer

/**
 * Create a Code Scan results view that displays the code scan results.
 */
internal class CodeWhispererCodeScanResultsView(private val project: Project) : JPanel(BorderLayout()) {

    private val codeScanTree: Tree = Tree().apply {
        isRootVisible = false
        CodeWhispererCodeScanTreeMouseListener(project).installOn(this)
        cellRenderer = ColoredTreeCellRenderer()
    }

    private val scrollPane = ScrollPaneFactory.createScrollPane(codeScanTree, true)

    private val toolbar = createToolbar().apply {
        setTargetComponent(this@CodeWhispererCodeScanResultsView)
        component.border = BorderFactory.createCompoundBorder(
            CustomLineBorder(JBUI.insetsRight(1)),
            component.border
        )
    }

    private val infoLabelInitialText = message("codewhisperer.codescan.run_scan_info")
    private val infoLabel = JLabel(infoLabelInitialText, JLabel.LEFT).apply {
        layout = GridBagLayout()
        border = BorderFactory.createCompoundBorder(
            CustomLineBorder(JBUI.insetsBottom(1)),
            BorderFactory.createEmptyBorder(7, 11, 8, 11)
        )
        icon = AllIcons.General.BalloonInformation
    }

    private val progressIndicator = JLabel(message("codewhisperer.codescan.scan_in_progress"), AnimatedIcon.Default(), JLabel.CENTER)

    // Results panel containing info label and progressIndicator/scrollPane
    private val resultsPanel = JPanel(BorderLayout()).apply {
        add(BorderLayout.NORTH, infoLabel)
    }

    init {
        add(BorderLayout.WEST, toolbar.component)
        add(BorderLayout.CENTER, resultsPanel)
    }

    fun getCodeScanTree() = codeScanTree

    /**
     * Updates the [codeScanTree] with the new tree model root and displays the same on the UI.
     */
    fun updateAndDisplayScanResults(scanTreeModel: CodeWhispererCodeScanTreeModel) {
        codeScanTree.apply {
            model = scanTreeModel
            repaint()
        }

        resultsPanel.apply {
            if (components.contains(progressIndicator)) remove(progressIndicator)
            add(BorderLayout.CENTER, scrollPane)
            revalidate()
            repaint()
        }

        changeInfoLabelToDisplayScanCompleted()
    }

    /**
     * Shows in progress indicator indicating that the scan is in progress.
     */
    fun showInProgressIndicator() {
        infoLabel.isVisible = false

        resultsPanel.apply {
            if (components.contains(scrollPane)) remove(scrollPane)
            add(BorderLayout.CENTER, progressIndicator)
            revalidate()
            repaint()
        }
    }

    /**
     * Sets info label to show error in case a runtime exception is encountered while running a code scan.
     */
    fun showError(errorMsg: String) {
        infoLabel.apply {
            text = errorMsg
            icon = AllIcons.General.Error
            isVisible = true
            repaint()
        }
        resultsPanel.apply {
            if (components.contains(scrollPane)) remove(scrollPane)
            if (components.contains(progressIndicator)) remove(progressIndicator)
            revalidate()
            repaint()
        }
    }

    private fun changeInfoLabelToDisplayScanCompleted() {
        infoLabel.icon = AllIcons.Actions.Commit
        infoLabel.text = message(
            "codewhisperer.codescan.run_scan_complete",
            (codeScanTree.model as CodeWhispererCodeScanTreeModel).getTotalIssuesCount(),
            project.name,
            INACTIVE_TEXT_COLOR,
            DateTimeFormatter.ISO_INSTANT.format(Instant.now())
        )
        infoLabel.repaint()
        infoLabel.isVisible = true
    }

    private fun createToolbar(): ActionToolbar {
        val actionManager = ActionManager.getInstance()
        val group = actionManager.getAction("aws.toolkit.codewhisperer.toolbar.security") as ActionGroup
        return actionManager.createActionToolbar(ACTION_PLACE, group, false)
    }

    private class ColoredTreeCellRenderer : TreeCellRenderer {
        override fun getTreeCellRendererComponent(
            tree: JTree?,
            value: Any?,
            selected: Boolean,
            expanded: Boolean,
            leaf: Boolean,
            row: Int,
            hasFocus: Boolean
        ): Component {
            value as DefaultMutableTreeNode
            val cell = JLabel()
            synchronized(value) {
                when (val obj = value.userObject) {
                    is VirtualFile -> {
                        cell.text = message("codewhisperer.codescan.file_name_issues_count", obj.name, obj.path, value.childCount, INACTIVE_TEXT_COLOR)
                        cell.icon = obj.fileType.icon
                    }
                    is CodeWhispererCodeScanIssue -> {
                        val cellText = "${obj.title}: ${obj.description.text}"
                        if (obj.isInvalid) {
                            cell.text = message("codewhisperer.codescan.scan_recommendation_invalid", obj.title, obj.displayTextRange(), INACTIVE_TEXT_COLOR)
                            cell.toolTipText = message("codewhisperer.codescan.scan_recommendation_invalid.tooltip_text")
                            cell.icon = AllIcons.General.Information
                        } else {
                            cell.text = message("codewhisperer.codescan.scan_recommendation", cellText, obj.displayTextRange(), INACTIVE_TEXT_COLOR)
                            cell.toolTipText = cellText
                            cell.icon = obj.issueSeverity.icon
                        }
                    }
                }
            }
            return cell
        }
    }

    private companion object {
        const val ACTION_PLACE = "CodeScanResultsPanel"
    }
}
