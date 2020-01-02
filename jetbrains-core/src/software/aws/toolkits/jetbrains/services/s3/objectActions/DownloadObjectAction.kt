// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.openapi.fileChooser.FileChooser
import com.intellij.openapi.fileChooser.FileChooserDescriptor
import com.intellij.openapi.fileChooser.FileChooserFactory
import com.intellij.openapi.fileChooser.FileSaverDescriptor
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.ui.AnActionButton
import com.intellij.util.io.outputStream
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeObjectNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeTable
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryConstants.TelemetryResult
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryService
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import java.io.OutputStream
import java.nio.file.Paths

class DownloadObjectAction(
    private val treeTable: S3TreeTable
) : AnActionButton(message("s3.download.object.action"), null, AllIcons.Actions.Download) {

    private val bucket = treeTable.bucket
    @Suppress("unused")
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.getRequiredData(LangDataKeys.PROJECT)

        val files = treeTable.getSelectedNodes().filterIsInstance<S3TreeObjectNode>()
        when {
            files.size == 1 -> downloadSingle(project, files.first())
            else -> downloadMultiple(project, files)
        }
    }

    private fun downloadMultiple(project: Project, files: List<S3TreeObjectNode>) {
        val baseDir = VfsUtil.getUserHomeDir()
        val descriptor = FileChooserDescriptor(false, true, false, false, false, false)
        val destination = FileChooser.chooseFile(descriptor, project, baseDir)?.path ?: return
        downloadAll(project, files.map { it.key to Paths.get(destination, it.name).outputStream() })
    }

    private fun downloadSingle(project: Project, file: S3TreeObjectNode) {
        val baseDir = VfsUtil.getUserHomeDir()
        val descriptor = FileSaverDescriptor(message("s3.download.object.action"), message("s3.download.object.description"))
        val destination = FileChooserFactory.getInstance().createSaveFileDialog(descriptor, project).save(baseDir, file.name)?.file?.outputStream() ?: return
        downloadAll(project, listOf(file.key to destination))
    }

    private fun downloadAll(project: Project, files: List<Pair<String, OutputStream>>) {
        GlobalScope.launch {
            try {
                files.forEach { (key, output) ->
                    try {
                        bucket.download(project, key, output)
                        TelemetryService.recordSimpleTelemetry(project, SINGLE_OBJECT, TelemetryResult.Succeeded)
                    } catch (e: Exception) {
                        e.notifyError(message("s3.download.object.failed", key))
                        TelemetryService.recordSimpleTelemetry(project, SINGLE_OBJECT, TelemetryResult.Failed)
                        throw e
                    }
                }
            } catch (e: Exception) {
                TelemetryService.recordSimpleTelemetry(project, ALL_OBJECTS, TelemetryResult.Failed, treeTable.selectedRows.size.toDouble())
            }
        }
    }

    override fun isEnabled(): Boolean = !(treeTable.isEmpty || (treeTable.selectedRow < 0) || (treeTable.getValueAt(treeTable.selectedRow, 1) == ""))

    companion object {
        private const val SINGLE_OBJECT = "s3_downloadobject"
        private const val ALL_OBJECTS = "s3_downloadobjects"
    }
}
