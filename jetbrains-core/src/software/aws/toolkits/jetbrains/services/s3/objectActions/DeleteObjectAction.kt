// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.openapi.project.Project
import com.intellij.openapi.ui.Messages
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch
import software.aws.toolkits.jetbrains.components.telemetry.ActionButtonWrapper
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeTable
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryConstants.TelemetryResult
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryService
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message

class DeleteObjectAction(private val treeTable: S3TreeTable) : ActionButtonWrapper(message("s3.delete.object.action"), null, AllIcons.Actions.Cancel) {

    @Suppress("unused")
    override fun doActionPerformed(e: AnActionEvent) {
        deleteSelectedObjects(e.getRequiredData(LangDataKeys.PROJECT), treeTable)
    }

    override fun isEnabled(): Boolean = (!(treeTable.isEmpty || (treeTable.selectedRow < 0) || (treeTable.getValueAt(treeTable.selectedRow, 1) == "")))
}

private const val TELEMETRY_NAME = "s3_deleteobject"

fun deleteSelectedObjects(project: Project, treeTable: S3TreeTable) {
    val rows = treeTable.selectedRows.toList()
    val response = Messages.showOkCancelDialog(
        project,
        message("s3.delete.object.description", rows.size),
        message("s3.delete.object.action"),
        message("s3.delete.object.delete"),
        message("s3.delete.object.cancel"), Messages.getWarningIcon()
    )

    if (response != Messages.OK) {
        TelemetryService.recordSimpleTelemetry(project, TELEMETRY_NAME, TelemetryResult.Cancelled)
    } else {
        val objects = rows.mapNotNull { treeTable.getNodeForRow(it)?.key }
        GlobalScope.launch {
            try {
                treeTable.bucket.deleteObjects(objects)
                treeTable.removeRows(rows)
                treeTable.refresh()
                TelemetryService.recordSimpleTelemetry(project, TELEMETRY_NAME, TelemetryResult.Succeeded)
            } catch (e: Exception) {
                e.notifyError(message("s3.delete.object.failed"))
                TelemetryService.recordSimpleTelemetry(project, TELEMETRY_NAME, TelemetryResult.Failed)
            }
        }
    }
}
