// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.codescan.listeners

import com.intellij.openapi.application.runInEdt
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.project.Project
import com.intellij.ui.DoubleClickListener
import com.intellij.ui.treeStructure.Tree
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.CodeWhispererCodeScanIssue
import java.awt.event.MouseEvent
import javax.swing.tree.DefaultMutableTreeNode

class CodeWhispererCodeScanTreeMouseListener(private val project: Project) : DoubleClickListener() {
    override fun onDoubleClick(e: MouseEvent): Boolean {
        val codeScanNode = (e.source as Tree).selectionPath?.lastPathComponent as? DefaultMutableTreeNode ?: return false
        var status = true
        synchronized(codeScanNode) {
            if (codeScanNode.userObject !is CodeWhispererCodeScanIssue) return false
            val codeScanIssue = codeScanNode.userObject as CodeWhispererCodeScanIssue
            val textRange = codeScanIssue.textRange ?: return false
            val startOffset = textRange.startOffset

            if (codeScanIssue.isInvalid) return false

            runInEdt {
                val editor = FileEditorManager.getInstance(project).openTextEditor(
                    OpenFileDescriptor(project, codeScanIssue.file, startOffset),
                    true
                )
                if (editor == null) {
                    LOG.error { "Cannot fetch editor for the file ${codeScanIssue.file.path}" }
                    status = false
                    return@runInEdt
                }
                // If the codeScanIssue is still valid and rangehighlighter was not added previously for some reason,
                // try adding again.
                if (!codeScanIssue.isInvalid && codeScanIssue.rangeHighlighter == null) {
                    codeScanIssue.rangeHighlighter = codeScanIssue.addRangeHighlighter(editor.markupModel)
                }
            }
        }
        return status
    }

    companion object {
        private val LOG = getLogger<CodeWhispererCodeScanTreeMouseListener>()
    }
}
