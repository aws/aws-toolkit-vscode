// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.openapi.ui.InputValidator
import com.intellij.openapi.ui.Messages
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch
import software.aws.toolkits.jetbrains.components.telemetry.ActionButtonWrapper
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeObjectNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeTable
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryConstants.TelemetryResult
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryService
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message

class RenameObjectAction(private val treeTable: S3TreeTable) :
    ActionButtonWrapper(message("s3.rename.object.action"), null, null) {

    @Suppress("unused")
    override fun doActionPerformed(e: AnActionEvent) {
        val project = e.getRequiredData(LangDataKeys.PROJECT)
        val node = treeTable.getSelectedNodes().firstOrNull() as? S3TreeObjectNode ?: return

        val newName = Messages.showInputDialog(
            project,
            message("s3.rename.object.title", node.name),
            message("s3.rename.object.action"),
            null,
            node.name,
            object : InputValidator {
                override fun checkInput(inputString: String?): Boolean = true

                override fun canClose(inputString: String?): Boolean = checkInput(inputString)
            }
        )
        if (newName == null) {
            TelemetryService.recordSimpleTelemetry(project, TELEMETRY_NAME, TelemetryResult.Cancelled)
        } else {
            GlobalScope.launch {
                try {
                    treeTable.bucket.renameObject(node.key, "${node.parent?.key}$newName")
                    treeTable.invalidateLevel(node)
                    treeTable.refresh()
                    TelemetryService.recordSimpleTelemetry(project, TELEMETRY_NAME, TelemetryResult.Succeeded)
                } catch (e: Exception) {
                    e.notifyError(message("s3.rename.object.failed"))
                    TelemetryService.recordSimpleTelemetry(project, TELEMETRY_NAME, TelemetryResult.Failed)
                }
            }
        }
    }

    override fun isEnabled(): Boolean = !(treeTable.isEmpty || (treeTable.selectedRow < 0) ||
        (treeTable.getValueAt(treeTable.selectedRow, 1) == "") || (treeTable.selectedRows.size > 1))

    companion object {
        private const val TELEMETRY_NAME = "s3_renameObject"
    }
}
