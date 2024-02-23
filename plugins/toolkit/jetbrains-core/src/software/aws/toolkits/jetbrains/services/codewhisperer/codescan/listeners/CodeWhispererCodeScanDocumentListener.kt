// Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.codewhisperer.codescan.listeners

import com.intellij.openapi.editor.event.DocumentEvent
import com.intellij.openapi.editor.event.DocumentListener
import com.intellij.openapi.fileEditor.FileDocumentManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.TextRange
import software.aws.toolkits.core.utils.error
import software.aws.toolkits.core.utils.getLogger
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.CodeWhispererCodeScanIssue
import software.aws.toolkits.jetbrains.services.codewhisperer.codescan.CodeWhispererCodeScanManager
import javax.swing.tree.TreePath

internal class CodeWhispererCodeScanDocumentListener(val project: Project) : DocumentListener {

    override fun documentChanged(event: DocumentEvent) {
        val scanManager = CodeWhispererCodeScanManager.getInstance(project)
        val treeModel = scanManager.getScanTree().model
        val file = FileDocumentManager.getInstance().getFile(event.document)
        if (file == null) {
            LOG.error { "Cannot find file for document ${event.document}" }
            return
        }
        val editedTextRange = TextRange.create(event.offset, event.offset + event.oldLength)
        val nodes = scanManager.getOverlappingScanNodes(file, editedTextRange)
        nodes.forEach {
            val issue = it.userObject as CodeWhispererCodeScanIssue
            synchronized(it) {
                treeModel.valueForPathChanged(TreePath(it.path), issue.copy(isInvalid = true))
            }
            issue.rangeHighlighter?.dispose()
            issue.rangeHighlighter?.textAttributes = null
        }
        scanManager.updateScanNodes(file)
    }

    companion object {
        private val LOG = getLogger<CodeWhispererCodeScanDocumentListener>()
    }
}
