// Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.services.s3

import com.intellij.openapi.fileEditor.FileEditorPolicy
import com.intellij.openapi.fileEditor.FileEditorProvider
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import software.aws.toolkits.jetbrains.utils.filesystem.LightFileEditor
import javax.swing.JComponent

class S3BucketViewer(project: Project, s3Bucket: S3VirtualBucket) : LightFileEditor() {

    private val bucketViewer: S3BucketViewerPanel = S3BucketViewerPanel(project, s3Bucket)

    override fun getName() = "S3 Bucket Viewer"

    override fun getComponent(): JComponent = bucketViewer.component
}

class S3BucketViewerProvider : FileEditorProvider, DumbAware {
    override fun getEditorTypeId() = EDITOR_TYPE_ID

    override fun accept(project: Project, file: VirtualFile) = file is S3VirtualBucket

    override fun createEditor(project: Project, file: VirtualFile) = S3BucketViewer(project, file as S3VirtualBucket)

    override fun getPolicy() = FileEditorPolicy.HIDE_DEFAULT_EDITOR

    companion object {
        const val EDITOR_TYPE_ID = "s3Bucket"
    }
}