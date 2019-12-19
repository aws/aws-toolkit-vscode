// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.fileChooser.FileChooserFactory
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch
import software.aws.toolkits.jetbrains.components.telemetry.ActionButtonWrapper
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeContinuationNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeTable
import software.aws.toolkits.jetbrains.services.s3.editor.getDirectoryKey
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryConstants
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryService
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message

class UploadObjectAction(
    private val treeTable: S3TreeTable
) : ActionButtonWrapper(message("s3.upload.object.action", treeTable.bucket.name), null, AllIcons.Actions.Upload) {
    private val bucket = treeTable.bucket

    override fun doActionPerformed(e: AnActionEvent) {
        val project = e.getRequiredData(LangDataKeys.PROJECT)

        val node = treeTable.getSelectedNodes().firstOrNull() ?: return
        val descriptor =
            FileChooserDescriptorFactory.createAllButJarContentsDescriptor().withDescription(message("s3.upload.object.action", bucket.name))
        val chooserDialog = FileChooserFactory.getInstance().createFileChooser(descriptor, project, null)
        val filesChosen = chooserDialog.choose(project, null)

        val directoryKey = node.getDirectoryKey()

        GlobalScope.launch {
            try {
                filesChosen.forEach { file ->
                    try {
                        bucket.upload(project, file.inputStream, file.length, directoryKey + file.name)
                        treeTable.invalidateLevel(node)
                        treeTable.refresh()
                        TelemetryService.recordSimpleTelemetry(project, SINGLE_OBJECT, TelemetryConstants.TelemetryResult.Succeeded)
                    } catch (e: Exception) {
                        e.notifyError(message("s3.upload.object.failed", file.path), project)
                        TelemetryService.recordSimpleTelemetry(project, SINGLE_OBJECT, TelemetryConstants.TelemetryResult.Failed)
                        throw e
                    }
                }
                TelemetryService.recordSimpleTelemetry(project, ALL_OBJECTS, TelemetryConstants.TelemetryResult.Succeeded, filesChosen.size.toDouble())
            } catch (e: Exception) {
                TelemetryService.recordSimpleTelemetry(project, ALL_OBJECTS, TelemetryConstants.TelemetryResult.Failed, filesChosen.size.toDouble())
            }
        }
    }

    override fun isEnabled(): Boolean =
        (treeTable.isEmpty || treeTable.selectedRows.size <= 1) && !treeTable.getSelectedNodes().any { it is S3TreeContinuationNode }

    companion object {
        private const val SINGLE_OBJECT = "s3_uploadobject"
        private const val ALL_OBJECTS = "s3_uploadobjects"
    }
}
