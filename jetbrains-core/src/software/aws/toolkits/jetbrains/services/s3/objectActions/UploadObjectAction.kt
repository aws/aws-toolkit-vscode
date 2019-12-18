// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3.objectActions

import com.intellij.icons.AllIcons
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.openapi.fileChooser.FileChooserDescriptorFactory
import com.intellij.openapi.fileChooser.FileChooserFactory
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.PutObjectResponse
import software.aws.toolkits.core.utils.allOf
import software.aws.toolkits.jetbrains.components.telemetry.ActionButtonWrapper
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeContinuationNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeNode
import software.aws.toolkits.jetbrains.services.s3.editor.S3TreeTable
import software.aws.toolkits.jetbrains.services.s3.editor.S3VirtualBucket
import software.aws.toolkits.jetbrains.services.s3.editor.getDirectoryKey
import software.aws.toolkits.jetbrains.services.s3.upload
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryConstants
import software.aws.toolkits.jetbrains.services.telemetry.TelemetryService
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message
import java.util.concurrent.CompletionStage

class UploadObjectAction(
    val bucket: S3VirtualBucket,
    private val treeTable: S3TreeTable
) : ActionButtonWrapper(message("s3.upload.object.action", bucket.name), null, AllIcons.Actions.Upload) {
    override fun doActionPerformed(e: AnActionEvent) {
        val project = e.getRequiredData(LangDataKeys.PROJECT)
        val client: S3Client = AwsClientManager.getInstance(project).getClient()

        val node = treeTable.getSelectedNodes().firstOrNull() ?: return
        val descriptor = FileChooserDescriptorFactory.createAllButJarContentsDescriptor()
            .withDescription(message("s3.upload.object.action", bucket.name))
        val chooserDialog = FileChooserFactory.getInstance().createFileChooser(descriptor, project, null)
        val filesChosen = chooserDialog.choose(project, null)

        filesChosen.map { file ->
            uploadObjectAction(client, project, file, node).whenComplete { _, error ->
                when (error) {
                    is Throwable -> {
                        error.notifyError(message("s3.upload.object.failed", file.path), project)
                        TelemetryService.recordSimpleTelemetry(project, SINGLE_OBJECT, TelemetryConstants.TelemetryResult.Failed)
                    }
                    else -> {
                        treeTable.invalidateLevel(node)
                        treeTable.refresh()
                        TelemetryService.recordSimpleTelemetry(project, SINGLE_OBJECT, TelemetryConstants.TelemetryResult.Succeeded)
                    }
                }
            }
        }.allOf().whenComplete { _, error ->
            TelemetryService.recordSimpleTelemetry(
                project,
                ALL_OBJECTS,
                if (error == null) TelemetryConstants.TelemetryResult.Succeeded else TelemetryConstants.TelemetryResult.Failed,
                filesChosen.size.toDouble()
            )
        }
    }

    override fun isEnabled(): Boolean =
        (treeTable.isEmpty || treeTable.selectedRows.size <= 1) && !treeTable.getSelectedNodes().any { it is S3TreeContinuationNode }

    fun uploadObjectAction(client: S3Client, project: Project, fileChosen: VirtualFile, node: S3TreeNode): CompletionStage<PutObjectResponse> {
        val bucketName = node.bucketName
        val directoryKey = node.getDirectoryKey()

        return client.upload(
            project,
            fileChosen.inputStream,
            fileChosen.length,
            bucketName,
            directoryKey + fileChosen.name,
            startInBackground = false
        )
    }

    companion object {
        private const val SINGLE_OBJECT = "s3_uploadobject"
        private const val ALL_OBJECTS = "s3_uploadobjects"
    }
}
