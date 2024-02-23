// Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.codescan

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.ui.ColoredTreeCellRenderer
import com.intellij.ui.DoubleClickListener
import com.intellij.ui.ScrollPaneFactory
import com.intellij.ui.SimpleTextAttributes
import com.intellij.ui.TreeSpeedSearch
import com.intellij.ui.treeStructure.Tree
import com.intellij.util.ui.UIUtil
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.resources.message
import java.awt.BorderLayout
import java.awt.event.MouseEvent
import javax.swing.BorderFactory
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.JTree
import javax.swing.tree.DefaultMutableTreeNode
import javax.swing.tree.DefaultTreeModel

internal class CodeWhispererCodeScanHighlightingFilesPanel(private val project: Project, files: List<VirtualFile>) : JPanel(BorderLayout()) {

    init {
        removeAll()
        val scannedFilesTreeNodeRoot = DefaultMutableTreeNode("CodeWhisperer scanned files for security scan")
        files.forEach {
            scannedFilesTreeNodeRoot.add(DefaultMutableTreeNode(it))
        }
        val scannedFilesTreeModel = DefaultTreeModel(scannedFilesTreeNodeRoot)
        val scannedFilesTree: Tree = Tree().apply {
            isRootVisible = false
            object : DoubleClickListener() {
                var status = true
                override fun onDoubleClick(event: MouseEvent): Boolean {
                    val fileNode = (event.source as Tree).selectionPath?.lastPathComponent as? DefaultMutableTreeNode
                    val file = fileNode?.userObject as? VirtualFile ?: return false
                    runInEdt {
                        val editor = FileEditorManager.getInstance(project).openTextEditor(
                            OpenFileDescriptor(project, file),
                            true
                        )
                        if (editor == null) {
                            LOG.error { "Cannot fetch editor for the file ${file.path}" }
                            status = false
                            return@runInEdt
                        }
                    }
                    return status
                }
            }.installOn(this)
            model = scannedFilesTreeModel
            cellRenderer = ScannedFilesTreeCellRenderer()
            repaint()
        }
        TreeSpeedSearch(scannedFilesTree, TreeSpeedSearch.NODE_DESCRIPTOR_TOSTRING, true)
        val scrollPane = ScrollPaneFactory.createScrollPane(scannedFilesTree, true)
        val htmlText = message("codewhisperer.codescan.scanned_files_heading", files.size)
        val label = JLabel(htmlText, JLabel.LEFT).apply {
            border = BorderFactory.createEmptyBorder(7, 26, 8, 11)
        }

        add(BorderLayout.NORTH, label)
        add(BorderLayout.CENTER, scrollPane)
        isVisible = true
        revalidate()
    }

    private class ScannedFilesTreeCellRenderer : ColoredTreeCellRenderer() {
        override fun customizeCellRenderer(
            tree: JTree,
            value: Any,
            selected: Boolean,
            expanded: Boolean,
            leaf: Boolean,
            row: Int,
            hasFocus: Boolean
        ) {
            value as DefaultMutableTreeNode
            val file = value.userObject as? VirtualFile
            val attributes = SimpleTextAttributes.LINK_ATTRIBUTES
            icon = file?.fileType?.icon
            font = UIUtil.getTreeFont()
            file?.path?.let { append(it, attributes) }
        }
    }

    companion object {
        private val LOG = getLogger<CodeWhispererCodeScanHighlightingFilesPanel>()
    }
}
