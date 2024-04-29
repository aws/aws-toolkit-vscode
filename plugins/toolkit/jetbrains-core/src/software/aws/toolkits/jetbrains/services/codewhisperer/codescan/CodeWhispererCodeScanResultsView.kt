// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.codescan

import com.intellij.icons.AllIcons
import com.intellij.ide.BrowserUtil
import com.intellij.openapi.actionSystem.ActionGroup
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.ActionToolbar
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.AnimatedIcon
import com.intellij.ui.OnePixelSplitter
import com.intellij.ui.ScrollPaneFactory
import com.intellij.ui.border.CustomLineBorder
import com.intellij.ui.components.ActionLink
import com.intellij.ui.treeStructure.Tree
import com.intellij.util.ui.JBUI
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.listeners.CodeWhispererCodeScanTreeMouseListener
import software.aws.toolkits.jetbrains.services.codewhisperer.layout.CodeWhispererLayoutConfig
import software.aws.toolkits.jetbrains.services.codewhisperer.layout.CodeWhispererLayoutConfig.addHorizontalGlue
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererColorUtil.INACTIVE_TEXT_COLOR
import software.aws.toolkits.jetbrains.services.codewhisperer.util.CodeWhispererConstants
import software.aws.toolkits.resources.message
import java.awt.BorderLayout
import java.awt.Component
import java.awt.GridBagConstraints
import java.awt.GridBagLayout
import java.net.URI
import java.time.Instant
import java.time.format.DateTimeFormatter
import javax.swing.BorderFactory
import javax.swing.JButton
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
    private val splitter = OnePixelSplitter(CODE_SCAN_SPLITTER_PROPORTION_KEY, 1.0f).apply {
        firstComponent = scrollPane
    }

    private val toolbar = createToolbar().apply {
        setTargetComponent(this@CodeWhispererCodeScanResultsView)
        component.border = BorderFactory.createCompoundBorder(
            CustomLineBorder(JBUI.insetsRight(1)),
            component.border
        )
    }

    private val infoLabelInitialText = message("codewhisperer.codescan.run_scan_info")
    private val infoLabelPrefix = JLabel(infoLabelInitialText, JLabel.LEFT).apply {
        icon = AllIcons.General.BalloonInformation
    }
    private val scannedFilesLabelLink = ActionLink().apply {
        border = BorderFactory.createEmptyBorder(0, 7, 0, 0)
        addActionListener {
            showScannedFiles(scannedFiles)
        }
    }
    private val learnMoreLabelLink = ActionLink().apply {
        border = BorderFactory.createEmptyBorder(0, 7, 0, 0)
    }

    private val completeInfoLabel = JPanel(GridBagLayout()).apply {
        layout = GridBagLayout()
        border = BorderFactory.createCompoundBorder(
            CustomLineBorder(JBUI.insetsBottom(1)),
            BorderFactory.createEmptyBorder(7, 11, 8, 11)
        )
        add(infoLabelPrefix, CodeWhispererLayoutConfig.inlineLabelConstraints)
        add(scannedFilesLabelLink, CodeWhispererLayoutConfig.inlineLabelConstraints)
        add(learnMoreLabelLink, CodeWhispererLayoutConfig.inlineLabelConstraints)
        addHorizontalGlue()
    }

    private val progressIndicatorLabel = JLabel(message("codewhisperer.codescan.scan_in_progress"), AnimatedIcon.Default(), JLabel.CENTER).apply {
        border = BorderFactory.createEmptyBorder(7, 7, 7, 7)
    }
    private val stopCodeScanButton = JButton(message("codewhisperer.codescan.stop_scan")).apply {
        addActionListener {
            CodeWhispererCodeScanManager.getInstance(project).stopCodeScan()
        }
    }

    private val progressIndicator = JPanel(GridBagLayout()).apply {
        add(progressIndicatorLabel, GridBagConstraints())
        add(stopCodeScanButton, GridBagConstraints().apply { gridy = 1 })
    }

    // Results panel containing info label and progressIndicator/scrollPane
    private val resultsPanel = JPanel(BorderLayout()).apply {
        add(BorderLayout.NORTH, completeInfoLabel)
    }

    private var scannedFiles: List<VirtualFile> = listOf()

    init {
        add(BorderLayout.WEST, toolbar.component)
        add(BorderLayout.CENTER, resultsPanel)
    }

    fun getCodeScanTree() = codeScanTree

    /**
     * Updates the [codeScanTree] with the new tree model root and displays the same on the UI.
     */
    fun updateAndDisplayScanResults(
        scanTreeModel: CodeWhispererCodeScanTreeModel,
        scannedFiles: List<VirtualFile>,
        isProjectTruncated: Boolean,
        scope: CodeWhispererConstants.CodeAnalysisScope
    ) {
        codeScanTree.apply {
            model = scanTreeModel
            repaint()
        }

        this.scannedFiles = scannedFiles

        if (isProjectTruncated) {
            learnMoreLabelLink.addActionListener {
                // TODO: Change this URL to point to updated security scan documentation
                BrowserUtil.browse(URI("https://docs.aws.amazon.com/codewhisperer/latest/userguide/security-scans.html"))
            }
        }

        resultsPanel.apply {
            if (components.contains(progressIndicator)) remove(progressIndicator)
            add(BorderLayout.CENTER, splitter)
            splitter.proportion = 1.0f
            splitter.secondComponent = null
            revalidate()
            repaint()
        }

        if (scope == CodeWhispererConstants.CodeAnalysisScope.PROJECT) {
            changeInfoLabelToDisplayScanCompleted(scannedFiles.size, isProjectTruncated)
        }
    }

    fun setStoppingCodeScan() {
        completeInfoLabel.isVisible = false
        stopCodeScanButton.isVisible = false
        resultsPanel.apply {
            if (components.contains(splitter)) remove(splitter)
            progressIndicatorLabel.apply {
                text = message("codewhisperer.codescan.stopping_scan")
                revalidate()
                repaint()
            }
            add(BorderLayout.CENTER, progressIndicator)
            revalidate()
            repaint()
        }
    }

    fun setDefaultUI() {
        completeInfoLabel.isVisible = true
        infoLabelPrefix.apply {
            text = infoLabelInitialText
            icon = AllIcons.General.BalloonInformation
            isVisible = true
        }
        scannedFilesLabelLink.apply {
            text = ""
            isVisible = false
        }
        learnMoreLabelLink.apply {
            text = ""
            isVisible = false
        }
        resultsPanel.apply {
            removeAll()
            add(BorderLayout.NORTH, completeInfoLabel)
            revalidate()
            repaint()
        }
    }

    /**
     * Shows in progress indicator indicating that the scan is in progress.
     */
    fun showInProgressIndicator() {
        completeInfoLabel.isVisible = false

        stopCodeScanButton.isVisible = true
        progressIndicatorLabel.text = message("codewhisperer.codescan.scan_in_progress")
        resultsPanel.apply {
            if (components.contains(splitter)) remove(splitter)
            add(BorderLayout.CENTER, progressIndicator)
            revalidate()
            repaint()
        }
    }

    /**
     * Sets info label to show error in case a runtime exception is encountered while running a code scan.
     */
    fun showError(errorMsg: String) {
        completeInfoLabel.isVisible = true
        infoLabelPrefix.apply {
            text = errorMsg
            icon = AllIcons.General.Error
            isVisible = true
            repaint()
        }
        scannedFilesLabelLink.text = ""
        learnMoreLabelLink.text = ""
        resultsPanel.apply {
            if (components.contains(splitter)) remove(splitter)
            if (components.contains(progressIndicator)) remove(progressIndicator)
            revalidate()
            repaint()
        }
    }
    private fun showScannedFiles(files: List<VirtualFile>) {
        val scannedFilesViewPanel = CodeWhispererCodeScanHighlightingFilesPanel(project, files)
        scannedFilesViewPanel.apply {
            isVisible = true
            revalidate()
        }
        splitter.apply {
            secondComponent = scannedFilesViewPanel
            proportion = 0.5f
            revalidate()
            repaint()
        }
    }

    private fun changeInfoLabelToDisplayScanCompleted(numScannedFiles: Int, isProjectTruncated: Boolean) {
        completeInfoLabel.isVisible = true
        infoLabelPrefix.icon = AllIcons.Actions.Commit
        infoLabelPrefix.text = message(
            "codewhisperer.codescan.run_scan_complete",
            numScannedFiles,
            (codeScanTree.model as CodeWhispererCodeScanTreeModel).getTotalIssuesCount(),
            project.name,
            if (isProjectTruncated) 1 else 0,
            INACTIVE_TEXT_COLOR,
            DateTimeFormatter.ISO_INSTANT.format(Instant.now())
        )
        infoLabelPrefix.repaint()
        infoLabelPrefix.isVisible = true
        scannedFilesLabelLink.text = message("codewhisperer.codescan.view_scanned_files", numScannedFiles)
        scannedFilesLabelLink.isVisible = true
        if (isProjectTruncated) {
            learnMoreLabelLink.apply {
                text = message("aws.settings.learn_more")
                isVisible = true
            }
        }
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
        const val CODE_SCAN_SPLITTER_PROPORTION_KEY = "CODE_SCAN_SPLITTER_PROPORTION"
    }
}
