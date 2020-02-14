// Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.icons.AllIcons
import com.intellij.openapi.fileChooser.FileChooser
import com.intellij.openapi.fileChooser.FileChooserDescriptor
import com.intellij.openapi.fileChooser.FileChooserFactory
import com.intellij.openapi.fileChooser.FileSaverDescriptor
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.util.io.outputStream
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeObjectNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeTable
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import software.aws.toolkits.telemetry.S3Telemetry
import java.io.OutputStream
import java.nio.file.Paths

class DownloadObjectAction(private val project: Project, treeTable: S3TreeTable) :
    S3ObjectAction(treeTable, message("s3.download.object.action"), AllIcons.Actions.Download) {

    private val bucket = treeTable.bucket

    override fun performAction(nodes: List<S3TreeNode>) {
        val files = nodes.filterIsInstance<S3TreeObjectNode>()
        when (files.size) {
            1 -> downloadSingle(project, files.first())
            else -> downloadMultiple(project, files)
        }
    }

    override fun enabled(nodes: List<S3TreeNode>): Boolean = nodes.all { it is S3TreeObjectNode }

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
                        S3Telemetry.downloadObject(project, success = true)
                    } catch (e: Exception) {
                        e.notifyError(message("s3.download.object.failed", key))
                        S3Telemetry.downloadObject(project, success = false)
                        throw e
                    }
                }
                S3Telemetry.downloadObjects(project, success = true, value = treeTable.selectedRows.size.toDouble())
            } catch (e: Exception) {
                S3Telemetry.downloadObjects(project, success = true, value = treeTable.selectedRows.size.toDouble())
            }
        }
    }
}
