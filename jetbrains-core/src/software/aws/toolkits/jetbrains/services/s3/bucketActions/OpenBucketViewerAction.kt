// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
package software.aws.toolkits.jetbrains.services.s3.bucketActions

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.fileEditor.OpenFileDescriptor
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.DumbService
import com.intellij.openapi.project.Project
import icons.AwsIcons
import software.amazon.awssdk.services.s3.S3Client
import software.aws.toolkits.jetbrains.core.AwsClientManager
import software.aws.toolkits.jetbrains.core.explorer.actions.SingleResourceNodeAction
import software.aws.toolkits.jetbrains.services.s3.S3BucketNode
import software.aws.toolkits.jetbrains.services.s3.S3VirtualBucket
import software.aws.toolkits.jetbrains.services.s3.S3VirtualFileSystem
import software.aws.toolkits.jetbrains.utils.notifyError
import software.aws.toolkits.resources.message

class OpenBucketViewerAction : SingleResourceNodeAction<S3BucketNode>(message("s3.open.viewer.bucket.action"), icon = AwsIcons.Resources.S3_BUCKET),
    DumbAware {

    override fun actionPerformed(selected: S3BucketNode, e: AnActionEvent) {
        val project = e.getRequiredData(LangDataKeys.PROJECT)
        val client: S3Client = AwsClientManager.getInstance(project).getClient()
        try {
            openEditor(selected, client, project)
        } catch (e: Exception) {
            e.notifyError(message("s3.open.viewer.bucket.failed"))
        }
    }

    override fun isDumbAware(): Boolean = true

    override fun update(selected: S3BucketNode, e: AnActionEvent) {
        val project = e.getRequiredData(LangDataKeys.PROJECT)
        e.presentation.isEnabled = !DumbService.getInstance(project).isDumb
    }

    private fun openEditor(selected: S3BucketNode, client: S3Client, project: Project) {
        val editorManager = FileEditorManager.getInstance(project)
        val virtualBucket = S3VirtualBucket(S3VirtualFileSystem(client), selected.bucket)
        editorManager.openTextEditor(OpenFileDescriptor(project, virtualBucket), true)
    }
}
