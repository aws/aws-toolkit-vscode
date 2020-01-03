// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.ui.AnActionButton
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeContinuationNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeTable
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryConstants.TelemetryResult
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryService
import software.aws.toolkits.resources.message
import java.awt.datatransfer.StringSelection

class CopyPathAction(private val treeTable: S3TreeTable) : AnActionButton(message("s3.copy.path"), null, AllIcons.Actions.Copy) {
    override fun isEnabled(): Boolean = treeTable.selectedRows.size == 1 && !treeTable.getSelectedNodes().any { it is S3TreeContinuationNode }

    override fun actionPerformed(e: AnActionEvent) {
        treeTable.getSelectedNodes().firstOrNull()?.let {
            CopyPasteManager.getInstance().setContents(StringSelection(it.key))
            TelemetryService.recordSimpleTelemetry(e.getRequiredData(LangDataKeys.PROJECT), TELEMETRY_NAME, TelemetryResult.Succeeded)
        }
    }

    override fun isDumbAware(): Boolean = true
    override fun updateButton(e: AnActionEvent) {}

    companion object {
        private const val TELEMETRY_NAME = "s3_copypath"
    }
}
